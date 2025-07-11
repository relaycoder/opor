import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { OporDatabase } from './types';
import type { SQLiteSession } from 'drizzle-orm/sqlite-core';

type MigrationConfig = {
  migrationsFolder: string;
  migrationsTable?: string;
};

/**
 * A Drizzle Kit-compatible migrator to manage schema evolution for your Opor database.
 *
 * @param db The Opor database instance.
 * @param config Configuration for the migrations.
 */
export async function migrate<TSchema extends Record<string, unknown>>(
  db: OporDatabase<TSchema>,
  config: MigrationConfig
): Promise<void> {
  const dialect = new SQLiteAsyncDialect();
  // We need to cast the session to the expected SQLiteSession type
  const session = db.session as unknown as SQLiteSession<"async", any, any, any>;
  await dialect.migrate(readMigrationFiles(config), session);
}