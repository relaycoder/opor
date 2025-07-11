import type { OporClient, SyncOptions, Changeset } from './types';
import { jsonParseWithBigInt, jsonStringifyWithBigInt } from './types';

export function sync(client: OporClient, options: SyncOptions): Promise<void> {
  // The `sync` method on the crSqlite instance handles everything.
  return client.crSqlite.sync(options);
}

/**
 * Generates a changeset of all database modifications.
 * This captures the entire history of changes to bring another peer up to date.
 */
export async function getChangeset(client: OporClient): Promise<string> {
  // `pullChanges` is designed for this peer-to-peer, manual sync model.
  // We pass 0n as the version to get all changes from the beginning of time.
  const changes = await client.crSqlite.pullChanges(0n);
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
  // The type assertion is safe due to the check above.
  await client.crSqlite.applyChanges(changes as Changeset[]);
}