import type { DB } from '@vlcn.io/crsqlite-wasm';
import type { DrizzleConfig } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/sqlite-proxy';
import {
  applyChangeset as oporApplyChangeset,
  getChangeset as oporGetChangeset,
  sync as oporSync,
} from './sync.js';
import { createLiveQuery, createProxy } from './live-query.js';
import type { OporClient, OporDatabase, QueryBuilder, SyncOptions } from './types.js';

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
  config: OporConfig<TSchema>
): OporDatabase<TSchema> {
  const client: OporClient = {
    crSqlite: crSqliteDb,
    drizzle: undefined as any, // assigned below
    schema: config.schema ?? {},
    liveQueries: new Map(),
    queryIdCounter: 0,
    tableListener: () => {},
  };

  const proxy = createProxy(client);
  const drizzleDb = drizzle(proxy, config);
  client.drizzle = drizzleDb;

  const onTablesChanged = (
    _type: any,
    _dbName: string,
    tableName: string
  ) => {
    const changedTables = new Set([tableName.toLowerCase()]);

    for (const query of client.liveQueries.values()) {
      const hasOverlap = [...query.tableDeps].some((dep) =>
        changedTables.has(dep)
      );
      if (hasOverlap) {
        query.refetch();
      }
    }
  };

  client.tableListener = client.crSqlite.onUpdate(onTablesChanged);

  // Create a type-safe database object that extends the Drizzle database
  const db = {
    ...drizzleDb,
    session: drizzleDb,
    crSqlite: client.crSqlite,

    liveQuery: <TResult>(builder: QueryBuilder<TSchema, TResult>) => {
      return createLiveQuery(client, builder);
    },

    sync: (options: SyncOptions) => oporSync(client, options),

    getChangeset: () => oporGetChangeset(client),

    applyChangeset: (changeset: string) => oporApplyChangeset(client, changeset),
  };

  // Return the database with the correct type
  return db as OporDatabase<TSchema>;
}