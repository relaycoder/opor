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