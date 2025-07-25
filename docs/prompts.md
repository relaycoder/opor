refactor codebase to use HOF no classes without causing fail tests

===

1. implement docs/test.plan.md in  test/e2e/[categories]/*.test.ts files, test/integration/[categories]/*.test.ts files, test/unit/[categories]/*.test.ts files,  test/test.util.ts
2. Test cases should be isolated and clean no left over even on sigterm
3. Test should use bun:test describe,it,afterAll,beforeAll,afterEach,beforeEach without mock
4. Create challenging, thorough test cases that fully verify implementation
5. Test cases should match expected requirements
6. Do not create test of tricks, simulation, stub, mock, etc. you should produce code of real algorithm
7. Do not create any new file for helper,script etc. just do what prompted.
8. test should create/use/modify test/test.util.ts for reusability
9 type of any, unknown, casting as: they are strictly forbidden!!!

===

use another lib than @vlcn.io because it problematioc, like bun wasm in window compability etc also not typesafe

A good replacement would be absurd-sql with sql.js, which can be enhanced with sql.js-httpvfs for better performanc

please do not use any, unknown or custom declaration

===

create the test plan items with `it should` language to docs/test.plan.md with content of separated list in test/e2e/[categories]/itemList test/integration/[categories]/itemList test/unit/[categories]/itemList

===
lets finish opor based on readme.md. make sure;

1. production ready
2. public api facing ready
3. use HOF, no class, no oop
4. no usage of type any and unknown even casting as

dont forget final check yaml!

===

create the better version of that library. with improvements and added features. the lib name is drizzle-live , better codebase, project structure, super ergonomic dx, better file, func naming... all is HOF.

1. the main goal is collaborative local-first browser env
2. beside reactive, also can be use as non reactive like sharing delta trough github commit

give me the most comprehensive readme.md first




===

Based on the provided files, this is the **`drizzle-orm-crsqlite-wasm`** library.

It's an **adapter** or **driver** that acts as a bridge between two other powerful libraries:

1.  **Drizzle ORM**: A popular, lightweight, and type-safe TypeScript ORM.
2.  **CR-SQLite (via VLCN.io)**: A version of SQLite extended with Conflict-Free Replicated Data Types (CRDTs). This allows for building local-first, offline-first, and real-time collaborative applications. The `wasm` part indicates it's designed to run in WebAssembly environments, like a web browser.

---

### In-depth Breakdown

#### What is its Purpose?

The primary goal of this library is to allow developers to use the familiar, type-safe query-building syntax of Drizzle ORM to interact with a CR-SQLite database running in the browser.

Without this library, you would have to write raw SQL strings to communicate with CR-SQLite, losing the benefits of Drizzle's auto-completion, type-checking, and schema awareness. This library translates Drizzle's query objects into the commands that the `@vlcn.io/xplat-api` (the CR-SQLite client) understands.

#### How It Works (Based on the Code)

1.  **`src/driver.ts`**: This file provides the main entry point, a `drizzle()` function. It takes a CR-SQLite database instance (`DBAsync` from `@vlcn.io/xplat-api`) and a Drizzle configuration. It then creates a custom `CRSQLiteSession` and wraps it in a Drizzle `BaseSQLiteDatabase` instance, effectively producing a "Drizzle-compatible" database object.

2.  **`src/session.ts`**: This is the core of the adapter.
    *   `CRSQLiteSession` extends Drizzle's `SQLiteSession`. It's a custom session manager that knows how to communicate with the CR-SQLite instance (`client: DBAsync`).
    *   The most important methods are `prepareQuery` and `transaction`.
    *   When Drizzle wants to run a query, it calls `prepareQuery`, which creates a `CRSQLitePreparedQuery`.
    *   `CRSQLitePreparedQuery` is where the translation happens. Its methods (`run`, `all`, `get`, `values`) take the query generated by Drizzle and execute it using the CR-SQLite's statement API (`stmt.run(...)`, `stmt.all(...)`, etc.).
    *   It also correctly manages transactions by using CR-SQLite's native transaction API (`client.imperativeTx()`).

3.  **`src/migrator.ts`**: This is a utility file that provides a `migrate()` function. It mimics the behavior of official Drizzle migrators (`drizzle-kit`). It allows you to run schema migration files against your CR-SQLite database, making it easy to manage database updates.

#### Who is this library for?

This library is for developers building **local-first web applications** who want:
*   The power of **real-time collaboration and offline data sync** provided by CR-SQLite.
*   The developer experience and **type-safety** of Drizzle ORM.

It enables a powerful stack for modern web development, where the application can work seamlessly online and offline, with data being stored locally in the browser's SQLite instance and synced with other clients when a connection is available.
