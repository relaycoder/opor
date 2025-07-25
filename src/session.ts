import { entityKind } from "drizzle-orm/entity"
import type { Logger } from "drizzle-orm/logger"
import { NoopLogger } from "drizzle-orm/logger"
import type { RelationalSchemaConfig, TablesRelationalConfig } from "drizzle-orm/relations"
import { fillPlaceholders, type Query } from "drizzle-orm/sql/sql"
import type { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core/dialect"
import { SQLiteTransaction } from "drizzle-orm/sqlite-core"
import type { SelectedFieldsOrdered } from "drizzle-orm/sqlite-core/query-builders/select.types"
import type { PreparedQueryConfig, SQLiteExecuteMethod } from "drizzle-orm/sqlite-core/session"
import { SQLitePreparedQuery, SQLiteSession } from "drizzle-orm/sqlite-core/session"
import type { DB } from "@vlcn.io/crsqlite-wasm"
import { currentTableCollector, extractTableNames } from "./live-query.js";

// Inferring types since they aren't exported
type Stmt = Awaited<ReturnType<DB["prepare"]>>;
type TX = Awaited<ReturnType<DB["imperativeTx"]>>[1];

interface CRSQLiteSessionOptions {
	logger?: Logger
}

type HeldStatementFinalization = { stmt: Promise<Stmt>, tx: TX | null }

export class CRSQLiteSession<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteSession<"async", void, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = "CRSQLiteSession"

	private logger: Logger
	private registry: FinalizationRegistry<HeldStatementFinalization>

	constructor(
		public client: DB,
		private dialect: SQLiteAsyncDialect,
		private schema: RelationalSchemaConfig<TSchema> | undefined,
		private options: CRSQLiteSessionOptions,
		private tx?: TX | undefined
	) {
		super(dialect)
		this.logger = options.logger ?? new NoopLogger()
		this.registry = new FinalizationRegistry<HeldStatementFinalization>((heldValue) => {
			heldValue.stmt.then((stmt) => stmt.finalize(heldValue.tx))
		})
	}

	prepareQuery<T extends PreparedQueryConfig>(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		_isResponseInArrayMode: boolean,
		customResultMapper?: (rows: unknown[][]) => unknown
	): CRSQLitePreparedQuery<T> {
		return new CRSQLitePreparedQuery(
			this.client,
			query,
			this.registry,
			this.logger,
			fields,
			this.tx ?? null,
			executeMethod,
			customResultMapper
		)
	}

	override prepareOneTimeQuery(
		query: Query,
		fields: SelectedFieldsOrdered | undefined,
		executeMethod: SQLiteExecuteMethod,
		_isResponseInArrayMode: boolean
	): SQLitePreparedQuery<PreparedQueryConfig & { type: "async" }> {
		return new CRSQLitePreparedQuery(
			this.client,
			query,
			null,
			this.logger,
			fields,
			this.tx ?? null,
			executeMethod
		)
	}

	override async transaction<T>(
		transaction: (db: CRSQLiteTransaction<TFullSchema, TSchema>) => Promise<T>
		// _config?: SQLiteTransactionConfig
	): Promise<T> {
		const [release, imperativeTx] = await this.client.imperativeTx()
		const session = new CRSQLiteSession<TFullSchema, TSchema>(
			this.client,
			this.dialect,
			this.schema,
			this.options,
			imperativeTx
		)
		const tx = new CRSQLiteTransaction<TFullSchema, TSchema>("async", this.dialect, session, this.schema)
		try {
			const result = await tx.transaction(transaction)
			release()
			return result
		} catch (err) {
			release()
			throw err
		}
	}

	exec(query: string) {
		this.logger.logQuery(query, [])
		return (this.tx ?? this.client).exec(query)
	}
}

export class CRSQLitePreparedQuery<
	T extends PreparedQueryConfig = PreparedQueryConfig,
> extends SQLitePreparedQuery<{
	type: "async"
	run: void
	all: T["all"]
	get: T["get"]
	values: T["values"]
	execute: T["execute"]
}> {
	static override readonly [entityKind]: string = "CRSQLitePreparedQuery"

	/** @internal */
	public stmt: Promise<Stmt>
	private oneTime: boolean

	constructor(
		client: DB,
		query: Query,
		registry: FinalizationRegistry<HeldStatementFinalization> | null,
		private logger: Logger,
		_fields: SelectedFieldsOrdered | undefined,
		private tx: TX | null,
		executeMethod: SQLiteExecuteMethod,
		private customResultMapper?: (rows: unknown[][]) => unknown
	) {
		super("async", executeMethod, query)
		this.stmt = (tx ?? client).prepare(query.sql)
		if (registry) {
			registry.register(this, { stmt: this.stmt, tx: tx ?? null })
			this.oneTime = false
		} else {
			this.oneTime = true
		}
	}
    
    private logQuery(sql: string, params: unknown[]) {
        this.logger.logQuery(sql, params);
        if (currentTableCollector) {
            const tables = extractTableNames(sql);
            for (const table of tables) {
                currentTableCollector.add(table);
            }
        }
    }

	/**
	 * execute query, no result expected
	 */
	async run(placeholderValues?: Record<string, unknown>): Promise<void> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {})
		this.logQuery(this.query.sql, params)
		const stmt = await this.stmt
		await stmt.run(this.tx, ...params)
		if (this.oneTime) {
			void stmt.finalize(this.tx)
		}
	}

	/**
	 * execute query and return all rows
	 */
	async all(placeholderValues?: Record<string, unknown>): Promise<unknown[]> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {})
		this.logQuery(this.query.sql, params)
		const stmt = await this.stmt
		stmt.raw(Boolean(this.customResultMapper))
		const rows = await stmt.all(this.tx, ...params)
		if (this.oneTime) {
			void stmt.finalize(this.tx)
		}
		return this.customResultMapper ? (this.customResultMapper(rows) as unknown[]) : rows
	}

	/**
	 * only query first row
	 */
	async get(placeholderValues?: Record<string, unknown>): Promise<unknown | undefined> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {})
		this.logQuery(this.query.sql, params)
		const stmt = await this.stmt
		stmt.raw(Boolean(this.customResultMapper))
		const row = await stmt.get(this.tx, ...params)
		if (this.oneTime) {
			void stmt.finalize(this.tx)
		}
		if (!row) {
			return undefined;
		}
		return this.customResultMapper ? this.customResultMapper([row]) : row
	}

	/**
	 * directly extract first column value from each row
	 */
	async values(placeholderValues?: Record<string, unknown>): Promise<unknown[]> {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {})
		this.logQuery(this.query.sql, params)
		const stmt = await this.stmt
		stmt.raw(true)
		const rows = (await stmt.all(null, ...params)) as unknown[][]
		if (this.oneTime) {
			void stmt.finalize(this.tx)
		}
		return rows.map((row) => row[0])
	}
}

export class CRSQLiteTransaction<
	TFullSchema extends Record<string, unknown>,
	TSchema extends TablesRelationalConfig,
> extends SQLiteTransaction<"async", void, TFullSchema, TSchema> {
	static override readonly [entityKind]: string = "CRSQLiteTransaction"

	override async transaction<T>(
		transaction: (tx: CRSQLiteTransaction<TFullSchema, TSchema>) => Promise<T>
	): Promise<T> {
		const savepointName = `sp${this.nestedIndex}`
		const tx = new CRSQLiteTransaction<TFullSchema, TSchema>(
			"async",
			// @ts-expect-error -- it does exist, but we have to add a constructor for TS to recognize it
			this.dialect,
			// @ts-expect-error -- it does exist, but we have to add a constructor for TS to recognize it
			this.session,
			this.schema,
			this.nestedIndex + 1
		)
		// @ts-expect-error -- it does exist, but we have to add a constructor for TS to recognize it
		await this.session.exec(`SAVEPOINT ${savepointName};`)
		try {
			const result = await transaction(tx)
			// @ts-expect-error -- it does exist, but we have to add a constructor for TS to recognize it
			await this.session.exec(`RELEASE savepoint ${savepointName};`)
			return result
		} catch (err) {
			// @ts-expect-error -- it does exist, but we have to add a constructor for TS to recognize it
			await this.session.exec(`ROLLBACK TO savepoint ${savepointName};`)
			throw err
		}
	}
}