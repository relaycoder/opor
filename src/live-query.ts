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