# Opor Test Plan

This document outlines the testing strategy for `opor`, covering unit, integration, and end-to-end tests. The structure reflects the intended test file organization under the `test/` directory.

## Unit Tests (`test/unit`)

### `createLiveDB` (`test/unit/core/createLiveDB.test.ts`)
- it should return an object that combines the Drizzle DB instance and opor-specific methods
- it should expose all standard Drizzle methods (select, insert, update, delete, etc.)
- it should expose `liveQuery`, `sync`, `getChangeset`, and `applyChangeset` methods
- it should throw an error if not provided a valid CR-SQLite database instance
- it should throw an error if not provided a valid Drizzle schema

### `liveQuery` (`test/unit/core/liveQuery.test.ts`)
- it should return a live result object with initial data, loading, and error states
- it should allow subscribing to data changes
- it should allow unsubscribing from data changes
- it should call the subscriber with initial data immediately upon subscription
- it should have a `destroy` method to clean up all subscribers and resources
- it should correctly handle queries with joins and complex conditions
- it should handle errors during query execution and report them via the `error` property

### Snapshot Sync (`test/unit/sync/snapshot.test.ts`)
- it should generate a non-empty changeset after mutations
- it should generate an empty changeset when there are no changes
- it should apply a valid changeset to a database instance
- it should throw an error when applying an invalid or corrupt changeset
- it should correctly merge changes from a changeset without data loss

---

## Integration Tests (`test/integration`)

### Core Reactivity Loop (`test/integration/reactivity/mutations.test.ts`)
- it should trigger a `liveQuery` subscriber when an `insert` mutation matches the query
- it should trigger a `liveQuery` subscriber when an `update` mutation affects a row matching the query
- it should trigger a `liveQuery` subscriber when a `delete` mutation removes a row matching the query
- it should NOT trigger a `liveQuery` subscriber when a mutation does NOT affect the query's result set
- it should handle multiple `liveQuery` instances observing different data slices
- it should update the correct `liveQuery` subscribers when a transaction with multiple mutations is committed
- it should correctly reflect changes within a `db.transaction()` call after it completes

### Snapshot Sync Workflow (`test/integration/sync/snapshot.test.ts`)
- it should sync two database instances using the get/apply changeset flow
- it should correctly update a `liveQuery` on the receiving client after `applyChangeset` is called
- it should handle multiple rounds of changeset application correctly
- it should allow a client to get a changeset, reset its DB, and re-apply the changeset to reach the same state

### Migrations (`test/integration/migrations/migrate.test.ts`)
- it should apply new migrations to an empty database
- it should apply pending migrations to an existing database
- it should not re-apply already applied migrations
- it should correctly update the database schema, allowing new queries to work

---

## E2E (End-to-End) Tests (`test/e2e`)

### React `useLiveQuery` Hook (`test/e2e/react/useLiveQuery.test.ts`)
- it should render initial data from a `liveQuery`
- it should re-render the component when the underlying data is mutated
- it should not cause re-renders when unrelated data is mutated
- it should correctly unsubscribe and clean up when the component unmounts
- it should memoize the query instance to prevent re-creation on every render

### Live Sync (`test/e2e/sync/live.test.ts`)
- it should connect to a mock sync server
- it should sync an `insert` from client A to client B in real-time
- it should sync an `update` from client A to client B in real-time
- it should sync a `delete` from client A to client B in real-time
- it should handle client disconnections and reconnections gracefully
- it should sync changes that occurred while a client was offline when it reconnects
- it should correctly handle authentication tokens