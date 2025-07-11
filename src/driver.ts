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