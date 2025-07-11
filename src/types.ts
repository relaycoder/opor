import type { DB } from '@vlcn.io/crsqlite-wasm';
import type Changeset from '@vlcn.io/crsqlite-wasm';

export type { Changeset };
import type { SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';

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
  db: SqliteRemoteDatabase<TSchema>
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
  SqliteRemoteDatabase<TSchema> & {
    session: SqliteRemoteDatabase<TSchema>;
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
    readonly crSqlite: DB;
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
  drizzle: SqliteRemoteDatabase<any>;
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
export const jsonParseWithBigInt = (json: string): Changeset[] => {
  return JSON.parse(json, (_, value) => {
    if (typeof value === 'string' && value.startsWith('BIGINT::')) {
      return BigInt(value.substring(8));
    }
    return value;
  });
};