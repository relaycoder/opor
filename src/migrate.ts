import { SQLiteAsyncDialect } from 'drizzle-orm/sqlite-core';
import { readMigrationFiles } from 'drizzle-orm/migrator';
import type { MigrationMeta } from 'drizzle-orm/migrator';
import type { OporDatabase } from './types';

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
  await dialect.migrate(readMigrationFiles(config), db.session);
}