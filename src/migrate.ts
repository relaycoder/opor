import { migrate as drizzleMigrate } from 'drizzle-orm/sqlite-proxy';
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
export function migrate<TSchema extends Record<string, unknown>>(
  db: OporDatabase<TSchema>,
  config: MigrationConfig
): Promise<void> {
  // OporDatabase is compatible with Drizzle's migrator.
  return drizzleMigrate(db, config);
}