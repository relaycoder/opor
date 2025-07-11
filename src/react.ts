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