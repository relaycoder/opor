# Directory Structure
```
docs/test.plan.md
package.json
src/driver.ts
src/index.ts
src/live-query.ts
src/migrator.ts
src/react.ts
src/session.ts
src/sync.ts
src/types.ts
src/utils.ts
tsconfig.json
```

# Files

## File: docs/test.plan.md
```markdown
# Opor Test Plan

This document outlines the testing strategy for `opor`, covering unit, integration, and end-to-end tests. The structure reflects the intended test file organization under the `test/` directory.

## Unit Tests (`test/unit`)

### `createLiveDB` (`test/unit/core/createLiveDB.test.ts`)
- it should return an object that combines the Drizzle DB instance and opor-specific methods
- it should expose all standard Drizzle methods (select, insert, update, delete, etc.)
- it should expose `liveQuery`, `sync`, `getChangeset`, and `applyChangeset` methods
- it should throw an error if not provided a valid CR-SQLite database instance
- it should throw an error if not provided a valid Drizzle schema

### `liveQuery` (`test/unit/core/liveQuery.test.ts`)
- it should return a live result object with initial data, loading, and error states
- it should allow subscribing to data changes
- it should allow unsubscribing from data changes
- it should call the subscriber with initial data immediately upon subscription
- it should have a `destroy` method to clean up all subscribers and resources
- it should correctly handle queries with joins and complex conditions
- it should handle errors during query execution and report them via the `error` property

### Snapshot Sync (`test/unit/sync/snapshot.test.ts`)
- it should generate a non-empty changeset after mutations
- it should generate an empty changeset when there are no changes
- it should apply a valid changeset to a database instance
- it should throw an error when applying an invalid or corrupt changeset
- it should correctly merge changes from a changeset without data loss

---

## Integration Tests (`test/integration`)

### Core Reactivity Loop (`test/integration/reactivity/mutations.test.ts`)
- it should trigger a `liveQuery` subscriber when an `insert` mutation matches the query
- it should trigger a `liveQuery` subscriber when an `update` mutation affects a row matching the query
- it should trigger a `liveQuery` subscriber when a `delete` mutation removes a row matching the query
- it should NOT trigger a `liveQuery` subscriber when a mutation does NOT affect the query's result set
- it should handle multiple `liveQuery` instances observing different data slices
- it should update the correct `liveQuery` subscribers when a transaction with multiple mutations is committed
- it should correctly reflect changes within a `db.transaction()` call after it completes

### Snapshot Sync Workflow (`test/integration/sync/snapshot.test.ts`)
- it should sync two database instances using the get/apply changeset flow
- it should correctly update a `liveQuery` on the receiving client after `applyChangeset` is called
- it should handle multiple rounds of changeset application correctly
- it should allow a client to get a changeset, reset its DB, and re-apply the changeset to reach the same state

### Migrations (`test/integration/migrations/migrate.test.ts`)
- it should apply new migrations to an empty database
- it should apply pending migrations to an existing database
- it should not re-apply already applied migrations
- it should correctly update the database schema, allowing new queries to work

---

## E2E (End-to-End) Tests (`test/e2e`)

### React `useLiveQuery` Hook (`test/e2e/react/useLiveQuery.test.ts`)
- it should render initial data from a `liveQuery`
- it should re-render the component when the underlying data is mutated
- it should not cause re-renders when unrelated data is mutated
- it should correctly unsubscribe and clean up when the component unmounts
- it should memoize the query instance to prevent re-creation on every render

### Live Sync (`test/e2e/sync/live.test.ts`)
- it should connect to a mock sync server
- it should sync an `insert` from client A to client B in real-time
- it should sync an `update` from client A to client B in real-time
- it should sync a `delete` from client A to client B in real-time
- it should handle client disconnections and reconnections gracefully
- it should sync changes that occurred while a client was offline when it reconnects
- it should correctly handle authentication tokens
```

## File: src/driver.ts
```typescript
import type { DB } from '@vlcn.io/crsqlite-wasm';
import type { DrizzleConfig } from 'drizzle-orm/utils';
import {
  applyChangeset as oporApplyChangeset,
  getChangeset as oporGetChangeset,
  sync as oporSync,
} from './sync.js';
import { createLiveQuery } from './live-query.js';
import type { OporClient, OporDatabase, QueryBuilder, SyncOptions } from './types.js';
import { DefaultLogger } from 'drizzle-orm/logger';
import {
	createTableRelationsHelpers,
	extractTablesRelationalConfig,
	type RelationalSchemaConfig,
	type TablesRelationalConfig,
} from "drizzle-orm/relations";
import { BaseSQLiteDatabase } from "drizzle-orm/sqlite-core";
import { SQLiteAsyncDialect } from "drizzle-orm/sqlite-core";
import { CRSQLiteSession } from "./session.js";

type OporConfig<TSchema extends Record<string, unknown>> = DrizzleConfig<TSchema>;

/**
 * Creates a reactive, local-first database powered by Opor and CR-SQLite.
 *
 * @param crSqliteDb The database instance from `@vlcn.io/crsqlite-wasm`.
 * @param config The Drizzle config, including your schema.
 * @returns An OporDatabase instance.
 */
export function createLiveDB<TSchema extends Record<string, unknown>>(
  crSqliteDb: DB,
  config: OporConfig<TSchema> = {}
): OporDatabase<TSchema> {

    const dialect = new SQLiteAsyncDialect();
    let logger;
    if (config?.logger === true) {
        logger = new DefaultLogger();
    } else if (config?.logger !== false) {
        logger = config?.logger;
    }

    let schema: RelationalSchemaConfig<TablesRelationalConfig> | undefined;
    if (config?.schema) {
        const tablesConfig = extractTablesRelationalConfig(
            config.schema,
            createTableRelationsHelpers
        );
        schema = {
            fullSchema: config.schema,
            schema: tablesConfig.tables,
            tableNamesMap: tablesConfig.tableNamesMap,
        };
    }

    const session = new CRSQLiteSession(crSqliteDb, dialect, schema, { logger });
    const db = new BaseSQLiteDatabase("async", dialect, session, schema) as OporDatabase<TSchema>;

    const oporClient: OporClient = {
        crSqlite: crSqliteDb,
        drizzle: db,
        schema: config?.schema ?? {},
        liveQueries: new Map(),
        queryIdCounter: 0,
        tableListener: () => {},
    };

    const onTablesChanged = (
        _type: any,
        _dbName: string,
        tableName: string
    ) => {
        const changedTables = new Set([tableName.toLowerCase()]);

        for (const query of oporClient.liveQueries.values()) {
            const hasOverlap = [...query.tableDeps].some((dep) =>
                changedTables.has(dep)
            );
            if (hasOverlap) {
                query.refetch();
            }
        }
    };

    oporClient.tableListener = oporClient.crSqlite.onUpdate(onTablesChanged);

    // enrich the db object with opor features
    db.liveQuery = <TResult>(builder: QueryBuilder<TSchema, TResult>) => {
        return createLiveQuery(oporClient, builder);
    };
    db.sync = (options: SyncOptions) => oporSync(oporClient, options);
    db.getChangeset = () => oporGetChangeset(oporClient);
    db.applyChangeset = (changeset: string) => oporApplyChangeset(oporClient, changeset);
    db.crSqlite = crSqliteDb;

    return db;
}
```

## File: src/migrator.ts
```typescript
import type { MigrationMeta } from "drizzle-orm/migrator"
import { sql, type TablesRelationalConfig } from "drizzle-orm"
import type { SQLiteSession } from "drizzle-orm/sqlite-core"
import type { OporDatabase } from "./types.js";

type MigrationConfig = {
	/** @default "__drizzle_migrations" */
	migrationsTable?: string
	migrations: MigrationMeta[]
}

export async function migrate<TSchema extends Record<string, unknown>>(
	db: OporDatabase<TSchema>,
	config: MigrationConfig
) {
	const migrations = config.migrations;
    if (!migrations.length) {
        return;
    }

	const migrationsTable = config.migrationsTable ?? "__drizzle_migrations"
	const migrationTableIdent = sql.identifier(migrationsTable)
	const migrationTableCreate = sql`
		CREATE TABLE IF NOT EXISTS ${migrationTableIdent} (
			id TEXT NOT NULL PRIMARY KEY,
			hash text NOT NULL,
			created_at INTEGER
		)
	`

	// @ts-expect-error -- `session` is present but not in the type, we add it in driver.ts
	await (db.session as SQLiteSession<"async", void, TSchema, TablesRelationalConfig>).run(
		migrationTableCreate
	)
	type MigrationEntry = { id: string; hash: string; created_at: number }

	const dbMigrations = await db.get<MigrationEntry | null>(
		sql`SELECT id, hash, created_at FROM ${migrationTableIdent} ORDER BY created_at DESC LIMIT 1`
	)

	const lastDbMigration = dbMigrations ?? undefined

	for (const migration of migrations) {
		if (!lastDbMigration || lastDbMigration.created_at < migration.folderMillis) {
			for (const stmt of migration.sql) {
				await db.run(sql.raw(stmt))
			}

			await db.run(
				sql`INSERT INTO ${migrationTableIdent} ("id", "hash", "created_at") VALUES(${crypto.randomUUID()}, ${migration.hash}, ${migration.folderMillis})`
			)
		}
	}
}
```

## File: src/react.ts
```typescript
import { useMemo } from 'react';
import { useSyncExternalStore } from 'react';
import type { LiveResult } from './types';

type UseLiveQueryResult<TData> = {
  data: TData | undefined;
  error: Error | undefined;
  loading: boolean;
};

/**
 * A React hook for subscribing to an Opor live query in a way that is
 * safe for concurrent rendering.
 *
 * @param queryFactory A factory function that returns a `LiveResult` object.
 *   The function is memoized by the hook, but for queries with dependencies,
 *   you should wrap the factory in `React.useCallback` yourself.
 *   Example: `useLiveQuery(() => db.liveQuery(...))`
 * @returns An object with the latest `data`, `error`, and `loading` state from the query.
 */
export function useLiveQuery<TResult>(
  queryFactory: () => LiveResult<TResult>
): UseLiveQueryResult<TResult> {
  const liveQuery = useMemo(queryFactory, [queryFactory]);

  const { data, error, loading } = useSyncExternalStore(
    liveQuery.subscribe,
    () => ({
      data: liveQuery.data,
      error: liveQuery.error,
      loading: liveQuery.loading,
    }),
    () => ({ // server snapshot
      data: liveQuery.data,
      error: liveQuery.error,
      loading: liveQuery.loading,
    })
  );

  return { data, error, loading };
}
```

## File: src/session.ts
```typescript
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
```

## File: src/index.ts
```typescript
export { createLiveDB } from './driver.js';
export { migrate } from './migrator.js';

export type {
  OporDatabase,
  LiveResult,
  QueryBuilder,
  SyncOptions,
} from './types.js';
```

## File: src/utils.ts
```typescript
/**
 * A simple deep equality check.
 * Handles objects, arrays, and primitives.
 * Does not handle Dates, RegExps, Maps, Sets correctly, but is sufficient for JSON-like data.
 */
export function deepEqual(a: any, b: any): boolean {
  if (a === b) return true;

  if (a && b && typeof a === 'object' && typeof b === 'object') {
    if (a.constructor !== b.constructor) return false;

    let length, i;
    if (Array.isArray(a)) {
      length = a.length;
      if (length !== b.length) return false;
      for (i = length; i-- > 0; ) {
        if (!deepEqual(a[i], b[i])) return false;
      }
      return true;
    }

    const keys = Object.keys(a);
    length = keys.length;
    if (length !== Object.keys(b).length) return false;

    for (i = length; i-- > 0; ) {
      const key = keys[i];
      if (key && (!Object.prototype.hasOwnProperty.call(b, key) || !deepEqual(a[key], b[key])))
        return false;
    }

    return true;
  }

  // true if both NaN, false otherwise
  return a !== a && b !== b;
}
```

## File: src/live-query.ts
```typescript
import { deepEqual } from './utils';
import type {
  LiveResult,
  QueryBuilder,
  Subscriber,
  LiveQuery,
  OporClient,
} from './types';

export let currentTableCollector: Set<string> | null = null;

/**
 * A simple SQL parser to extract table names from a query.
 * This is not foolproof but works for most common queries.
 * It looks for table names after FROM, JOIN, UPDATE, INSERT INTO, DELETE FROM.
 */
export const extractTableNames = (sql: string): Set<string> => {
  const tables = new Set<string>();
  const regex =
    /\b(?:from|join|update|into|delete\s+from)\s+`?([a-zA-Z0-9_]+)`?/gi;
  let match;
  while ((match = regex.exec(sql)) !== null) {
    if (match[1]) {
      tables.add(match[1].toLowerCase());
    }
  }
  return tables;
};

// The proxy is no longer needed with the custom driver.

export function createLiveQuery<TSchema extends Record<string, unknown>, TResult>(
  client: OporClient,
  builder: QueryBuilder<TSchema, TResult>
): LiveResult<TResult> {
  const internalQuery: LiveQuery<TResult> = {
    id: ++client.queryIdCounter,
    builder: builder as QueryBuilder<Record<string, unknown>, TResult>,
    subscribers: new Set(),
    tableDeps: new Set(),
    // These will be populated by the refetch function
    result: undefined as any, // assigned right after
    refetch: async () => {}, // assigned right after
    destroy: () => {}, // assigned right after
    updateState: (update) => {
      if (internalQuery.result) {
        Object.assign(internalQuery.result, update);
      }
    },
  };

  const notifySubscribers = () => {
    if (!internalQuery.result) return;
    for (const sub of internalQuery.subscribers) {
      if (internalQuery.result.data !== undefined) {
        sub(internalQuery.result.data);
      }
    }
  };

  const refetch = async () => {
    internalQuery.updateState({ loading: true });

    // If this is the first run, we need to collect table dependencies.
    const isFirstRun = internalQuery.tableDeps.size === 0;
    if (isFirstRun) {
      currentTableCollector = internalQuery.tableDeps;
    }

    try {
      const newData = await internalQuery.builder(client.drizzle);
      if (!internalQuery.result || !deepEqual(internalQuery.result.data, newData)) {
        internalQuery.updateState({ data: newData });
        notifySubscribers();
      }
      internalQuery.updateState({ error: undefined });
    } catch (e) {
      console.error(`Opor: LiveQuery (id: ${internalQuery.id}) failed.`, e);
      internalQuery.updateState({ error: e instanceof Error ? e : new Error(String(e)) });
    } finally {
      internalQuery.updateState({ loading: false });
      if (isFirstRun) {
        currentTableCollector = null;
      }
    }
  };

  internalQuery.refetch = refetch;
  internalQuery.destroy = () => {
    client.liveQueries.delete(internalQuery.id);
  };

  const result: LiveResult<TResult> = {
    data: undefined,
    error: undefined,
    loading: true,
    subscribe: (callback: Subscriber<TResult>) => {
      internalQuery.subscribers.add(callback);
      // Immediately call back with current data if available
      if (result.data !== undefined) {
        callback(result.data);
      }
      return () => {
        internalQuery.subscribers.delete(callback);
      };
    },
    refetch,
    destroy: internalQuery.destroy,
  };

  internalQuery.result = result;
  client.liveQueries.set(internalQuery.id, internalQuery);

  // Initial fetch
  refetch();

  return result;
}
```

## File: src/sync.ts
```typescript
import type { DB } from '@vlcn.io/crsqlite-wasm';
import type { OporClient, SyncOptions, Changeset } from './types';
import { jsonParseWithBigInt, jsonStringifyWithBigInt } from './types';

// Define the extended DB interface with the CR-SQLite sync methods
interface ExtendedDB extends DB {
  sync(options: SyncOptions): Promise<void>;
  pullChanges(version: bigint): Promise<Changeset>;
  applyChanges(changes: Changeset): Promise<void>;
}

export function sync(client: OporClient, options: SyncOptions): Promise<void> {
  // The `sync` method on the crSqlite instance handles everything.
  // We need to cast to ExtendedDB because the CR-SQLite type definitions don't include these methods
  const db = client.crSqlite as unknown as ExtendedDB;
  return db.sync(options);
}

/**
 * Generates a changeset of all database modifications.
 * This captures the entire history of changes to bring another peer up to date.
 */
export async function getChangeset(client: OporClient): Promise<string> {
  // `pullChanges` is designed for this peer-to-peer, manual sync model.
  // We pass 0n as the version to get all changes from the beginning of time.
  const db = client.crSqlite as unknown as ExtendedDB;
  const changes = await db.pullChanges(0n);
  return jsonStringifyWithBigInt(changes);
}

/**
 * Applies a changeset from a peer to the local database.
 */
export async function applyChangeset(
  client: OporClient,
  changeset: string
): Promise<void> {
  const changes = jsonParseWithBigInt(changeset);
  if (
    !Array.isArray(changes) ||
    // A quick check to see if it looks like a changeset array
    !changes.every((c) => Array.isArray(c) && c.length === 8)
  ) {
    throw new Error(
      'Invalid changeset format. Expected a JSON array of change tuples.'
    );
  }
  // Apply the changes using the CR-SQLite API
  const db = client.crSqlite as unknown as ExtendedDB;
  await db.applyChanges(changes);
}
```

## File: tsconfig.json
```json
{
  "compilerOptions": {
    // Environment setup & latest features
    "lib": ["ESNext"],
    "target": "ESNext",
    "module": "Preserve",
    "moduleDetection": "force",
    "jsx": "react-jsx",
    "allowJs": true,

    // Bundler mode
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "noEmit": true,

    // Best practices
    "strict": true,
    "skipLibCheck": true,
    "noFallthroughCasesInSwitch": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,

    // Some stricter flags (disabled by default)
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitAny": true,
    "noPropertyAccessFromIndexSignature": false
  },
  "include": ["src/**/*", "test/**/*"],
  "exclude": ["dist"]
}
```

## File: package.json
```json
{
  "name": "opor",
  "version": "0.1.0",
  "description": "Stop fetching data. Start observing it. A reactive Drizzle ORM driver for local-first apps.",
  "type": "module",
  "main": "./dist/index.js",
  "module": "./dist/index.js",
  "types": "./dist/index.d.ts",
  "files": [
    "dist",
    "README.md"
  ],
  "exports": {
    ".": {
      "import": "./dist/index.js",
      "types": "./dist/index.d.ts"
    },
    "./react": {
      "import": "./dist/react.js",
      "types": "./dist/react.d.ts"
    }
  },
  "scripts": {
    "build": "tsc",
    "dev": "tsc -w",
    "prepublishOnly": "npm run build"
  },
  "devDependencies": {
    "@types/react": "^18.3.3",
    "typescript": "^5.4.5",
    "@types/bun": "latest"
  },
  "peerDependencies": {
    "react": ">=18.2.0",
    "@vlcn.io/crsqlite-wasm": "^0.16.0",
    "drizzle-orm": ">=0.30.0"
  },
  "peerDependenciesMeta": {
    "react": {
      "optional": true
    }
  },
  "private": true
}
```

## File: src/types.ts
```typescript
import type { DB } from '@vlcn.io/crsqlite-wasm';
import type { BaseSQLiteDatabase } from 'drizzle-orm/sqlite-core';
import type { CRSQLiteSession } from './session.js';

// Define a proper Changeset type based on the CR-SQLite API structure
export type Changeset = [
  string,    // table name
  string,    // pk
  bigint,    // version
  bigint,    // site id
  number,    // cl
  number,    // seq
  string,    // col name
  string     // value
][];

// --- PUBLIC TYPES ---

/**
 * A function that builds a Drizzle query.
 * @param db The Drizzle database instance.
 * @returns A Drizzle query promise.
 */
export type QueryBuilder<
  TSchema extends Record<string, unknown>,
  TResult
> = (
  db: BaseSQLiteDatabase<'async', any, TSchema>
) => Promise<TResult>;

/**
 * The reactive result of a live query.
 */
export type LiveResult<TData> = {
  /** The current data of the query. Undefined until the first fetch completes. */
  readonly data: TData | undefined;
  /** The error object if the query fails. */
  readonly error: Error | undefined;
  /** True if the query is currently running. */
  readonly loading: boolean;
  /**
   * Subscribe to changes in the query result.
   * @param callback The function to call with the new data.
   * @returns A function to unsubscribe.
   */
  subscribe: (callback: Subscriber<TData>) => Unsubscriber;
  /**
   * Manually refetch the query.
   */
  refetch: () => Promise<void>;
  /**
   * Destroys the live query and cleans up all resources.
   */
  destroy: () => void;
};

/**
 * The main Opor database instance.
 * It's a Drizzle database instance augmented with reactive and sync capabilities.
 */
export type OporDatabase<TSchema extends Record<string, unknown>> =
  BaseSQLiteDatabase<'async', any, TSchema> & {
    /**
     * The internal Drizzle session. Not meant for public use.
     * @internal
     */
    session: CRSQLiteSession<any, any>;
    /**
     * Creates a reactive "live" query.
     * The query will automatically update when its underlying data changes.
     *
     * @param builder A function that returns a Drizzle query.
     * @returns A `LiveResult` object to subscribe to.
     */
    liveQuery: <TResult>(
      builder: QueryBuilder<TSchema, TResult>
    ) => LiveResult<TResult>;

    /**
     * Initiates continuous, real-time sync with a remote server.
     * @param options The sync configuration.
     */
    sync: (options: SyncOptions) => Promise<void>;

    /**
     * Generates a changeset of all local database modifications.
     * The changeset is a serialized string that can be stored or transferred.
     * @returns A promise that resolves to the changeset string.
     */
    getChangeset: () => Promise<string>;

    /**
     * Applies a changeset from a peer to the local database.
     * This will trigger updates in affected live queries.
     * @param changeset The changeset string to apply.
     */
    applyChangeset: (changeset: string) => Promise<void>;

    /**
     * The raw CR-SQLite database instance from `@vlcn.io/client-crsqlite`.
     * Use this for advanced, direct database access if needed.
     */
    crSqlite: DB;
  };

/**
 * Options for configuring real-time sync.
 */
export type SyncOptions = {
  /** The WebSocket endpoint of your sync server. e.g., 'wss://your-server.com/sync' */
  endpoint: string;
  /** A unique name for the database on the server. */
  dbName: string;
  /** An authentication token for the sync session, if required by your server. */
  authToken?: string;
};

// --- INTERNAL TYPES ---

export type Subscriber<TData> = (data: TData) => void;
export type Unsubscriber = () => void;

export type LiveQuery<TData> = {
  id: number;
  builder: QueryBuilder<Record<string, unknown>, TData>;
  result: LiveResult<TData>;
  subscribers: Set<Subscriber<TData>>;
  tableDeps: Set<string>;
  refetch: () => Promise<void>;
  destroy: () => void;
  updateState: (update: Partial<Omit<LiveResult<TData>, 'subscribe' | 'refetch' | 'destroy'>>) => void;
};

/**
 * The internal state managed by `createLiveDB`.
 */
export type OporClient = {
  crSqlite: DB;
  drizzle: OporDatabase<any>;
  schema: Record<string, unknown>;
  liveQueries: Map<number, LiveQuery<any>>;
  queryIdCounter: number;
  tableListener: () => void; // unsubscriber for db.onUpdate
};

// Helper to serialize BigInts in JSON
export const jsonStringifyWithBigInt = (obj: any): string => {
  return JSON.stringify(obj, (_, value) =>
    typeof value === 'bigint' ? `BIGINT::${value.toString()}` : value
  );
};

// Helper to deserialize BigInts in JSON
export const jsonParseWithBigInt = (json: string): Changeset => {
  return JSON.parse(json, (_, value) => {
    if (typeof value === 'string' && value.startsWith('BIGINT::')) {
      return BigInt(value.substring(8));
    }
    return value;
  });
};
```
