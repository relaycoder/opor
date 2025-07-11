<div align="center">

<pre>
  _   _   _   _
 / \ / \ / \ / \
( o | p | o | r )
 \_/ \_/ \_/ \_/
</pre>

# 🍲⚡ Opor

### Stop fetching data. Start observing it.

**`opor`** is a revolutionary Drizzle ORM driver that transforms your standard database schema into a **real-time, collaborative, local-first powerhouse**. It provides a breathtakingly simple API to build applications that feel alive, work flawlessly offline, and sync effortlessly with collaborators.

</div>

| <a href="https://github.com/your-repo/opor/actions/workflows/ci.yml"><img src="https://github.com/your-repo/opor/actions/workflows/ci.yml/badge.svg" alt="Build Status"/></a> | <a href="https://www.npmjs.com/package/opor"><img src="https://badge.fury.io/js/opor.svg" alt="NPM version"/></a> | <a href="./LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="MIT License"/></a> | <a href="http://makeapullrequest.com"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"/></a> |
| :--- | :--- | :--- | :--- |

---

## The Philosophy of Opor: A Taste of Simplicity

Opor is a beloved Indonesian dish, a rich yet comforting curry made with coconut milk. It’s known for two things: a harmonious blend of complex spices and its role in bringing people together during celebrations. This library is built on the same philosophy.

*   **🍲 Harmonious & Rich:** Just as Opor blends numerous spices into a single, delicious flavor, `opor` blends complex technologies—CRDTs, reactive queries, and sync protocols—into one simple, harmonious API. You get the richness without the complexity.
*   **🥥 Comforting & Reliable:** The coconut milk (`santan`) in Opor creates a comforting, dependable base. We see our API as the `santan` of your stack—a reliable foundation that smooths over the harsh complexities of state management, making your development process comforting and satisfying.
*   **🤝 Communal & Shared:** Opor is a dish meant for the community, for sharing with family and friends. `opor` is designed to build these shared experiences, making collaborative, multi-user applications the default, not a feature you bolt on later.

## The Agony of Modern State Management

You know the drill. Fetch data, manage loading states, handle errors, re-fetch on mutation, subscribe to WebSockets for real-time updates, and pray your cache invalidation logic is correct. It's a complex, error-prone mess.

**🤮 Before Opor:**

```tsx
// A typical React data-fetching component
function TodoList() {
  const [todos, setTodos] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // 1. Initial data fetch
  useEffect(() => {
    setIsLoading(true);
    api.getTodos()
      .then(data => setTodos(data))
      .catch(err => setError(err))
      .finally(() => setIsLoading(false));
  }, []);

  // 2. Subscribe to real-time updates
  useEffect(() => {
    const socket = connectToWebSocket();
    socket.on('todo_updated', (updatedTodo) => {
      setTodos(currentTodos => /* manually update state */);
    });
    return () => socket.disconnect();
  }, []);

  // 3. Manually refetch after a local mutation...
  async function handleAddTodo(content) {
    await api.addTodo(content);
    // Now refetch everything...
    const data = await api.getTodos();
    setTodos(data);
  }

  // ... and then render something
}
```

This is the complexity we've been taught to accept. **It's time for a new paradigm.**

## The `opor` Revolution

What if your queries were... alive? What if your UI was a direct reflection of your database state, with zero boilerplate?

**😎 With Opor:**

```tsx
import { useLiveQuery } from './hooks'; // A simple adapter hook

// The *entire* component logic.
function TodoList() {
  const { data: todos } = useLiveQuery(
    // Write a Drizzle query. That's it.
    () => db.liveQuery(d => d.query.todos.findMany())
  );

  return (
    <ul>
      {todos?.map(todo => <li key={todo.id}>{todo.content}</li>)}
    </ul>
  );
}

// Mutations are just standard Drizzle.
// The component above will update automatically. Magic.
await db.insert(todos).values({ ... });
```

This is the core promise of `opor`: **drastically simplified code that is more powerful, resilient, and collaborative by default.**

## How It Works: The Magic Explained

`opor` sits between your application and a [CR-SQLite](https://vlcn.io/) database running in the browser. It intercepts your queries and mutations, adding a layer of reactive magic and sync intelligence.

```plaintext
              Your UI (React, Svelte, Vue...)
                        ▲
                        │ (Automatic, granular updates)
┌───────────────────────┴────────────────────────┐
│ 🍲⚡ opor              (The Reactive Core)      │
│                                                │
│  ┌─liveQuery()───────────────────────────────┐ │
│  │                                           │ │
│  │ Returns a subscribable "live" result set  │ │
│  └───────────────────────────────────────────┘ │
│                                                │
│  ┌─insert() update() delete()────────────────┐ │
│  │                                           │ │
│  │ Standard Drizzle mutations that trigger   │ │
│  │ updates in all affected live queries      │ │
│  └───────────────────────────────────────────┘ │
└───────────────────────┬────────────────────────┘
                        │ (SQL statements)
                        ▼
           ╔══════════════════════════╗      <───────┐
           ║ CR-SQLite (WASM in  navegador) ║         (Live Sync)
           ╚══════════════════════════╝      <───────┐ (Snapshot Sync)
                        ▲                        │
                        │ (Delta Sync)           │
                        ▼                        │
              Remote Sync Server / Peer ─────────┘
```

---

## 📖 Table of Contents

1.  [✨ **Core Pillars**](#-core-pillars)
2.  [🚀 **The 5-Minute Tutorial**](#-the-5-minute-tutorial)
3.  [🔄 **Sync on Your Terms: The Two Sync Models**](#-sync-on-your-terms-the-two-sync-models)
    *   [Live Sync (Real-time Collaboration)](#live-sync-real-time-collaboration)
    *   [Snapshot Sync (Git-based & Manual)](#snapshot-sync-git-based--manual)
4.  [🧰 **API Deep Dive**](#-api-deep-dive)
5.  [🧩 **Framework Cookbooks** (React, Svelte, Vue)](#-framework-cookbooks)
6.  [🤔 **Core Design Principles**](#-core-design-principles)
7.  [📦 **Installation**](#-installation)
8.  [🤝 **Contributing**](#-contributing)

---

## ✨ Core Pillars

*   **🧘 Truly Reactive:** Your UI becomes a function of your database state. Write a query once and watch your app update in real-time.
*   ** Drizzle Native API:** A minimal, functional API built with Higher-Order Functions that feels like a natural extension of Drizzle.
*   **🤝 Sync on Your Terms:** Choose between effortless real-time sync for live collaboration or powerful changeset-based sync for version-controlled or manual workflows.
*   **🌐 Local-First by Default:** Your app is born offline-capable. Data lives with the user, making it fast and resilient. Sync is an enhancement, not a requirement.
*   **🧩 Framework Agnostic:** A tiny, universal `subscribe` interface means you can plug it into any framework with a few lines of code.

## 🚀 The 5-Minute Tutorial

Let's build a live-updating, collaborative app from scratch.

#### 1. Define the Schema

This is pure Drizzle. `opor` works with your existing schemas.

```ts
// src/db/schema.ts
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  author: text('author'),
  version: integer('version').notNull().default(1), // Essential for CRDTs
});
```

#### 2. Create the Live Database

Use the `createLiveDB` factory to wire everything up.

```ts
// src/db/index.ts
import { createLiveDB } from 'opor';
import * as schema from './schema';
import createCrSqlite from '@vlcn.io/crsqlite-wasm';

// This is an async factory, so wrap it in a promise for top-level await
const crSqlite = await createCrSqlite();
const sqliteDb = await crSqlite.open('app.db');

export const db = createLiveDB(sqliteDb, { schema });
```

#### 3. Create a Live Query

Instead of a one-off `db.select()`, use `db.liveQuery()` to create a subscription. It takes a function that receives the Drizzle instance, giving you full type-safety.

```ts
// Create a query that finds all posts by 'admin'
const adminPostsQuery = db.liveQuery(
  d => d.query.posts.findMany({ where: (posts, { eq }) => eq(posts.author, 'admin') })
);
```

#### 4. Observe the Data

Subscribe to the query to get live updates.

```ts
adminPostsQuery.subscribe(posts => {
  console.log('Admin posts changed!', posts);
  // Re-render your UI here...
});
```
*(See the [Framework Cookbooks](#-framework-cookbooks) for elegant integration patterns.)*

#### 5. Mutate and Watch the Magic

Use standard Drizzle mutations. Any change that affects the query's result set will automatically trigger your subscriber.

```ts
// This will NOT trigger the subscription above
await db.insert(posts).values({ id: 'p1', title: 'Hello', author: 'user' });

// This WILL trigger the subscription
await db.insert(posts).values({ id: 'p2', title: 'Admin Rules', author: 'admin' });
// Your console will log: "Admin posts changed! [ ...{id: 'p2'}... ]"
```

You've just built a reactive system. No state management libraries, no manual refetching.

## 🔄 Sync on Your Terms: The Two Sync Models

`opor` is not dogmatic about how you sync. It provides two powerful models to fit your architecture.

### Live Sync (Real-time Collaboration)

**This is like a shared document.** Changes from one user are broadcast to all other connected users in real-time. It's perfect for chat apps, collaborative editors, and live dashboards.

Simply point `opor` at your sync server.

```ts
// src/sync.ts
import { db } from './db';

// Connect to the mothership. That's it.
db.sync({
  endpoint: 'wss://your-sync-server.com/sync',
  dbName: 'my-project-db',
  authToken: 'user-jwt-token', // For authenticated sessions
});
```
Now, when User A makes a change, User B's `liveQuery` instances will update automatically.

### Snapshot Sync (Git-based & Manual)

**This is like sharing a file.** Generate a "diff" of your database changes, which you can then share however you want: commit it to Git, send it via email, or transfer it over a peer-to-peer connection.

**Use cases:**
*   A design tool where users can version and share their project state.
*   A configuration system where changes are proposed via Git pull requests.
*   A secure way to transfer data without a central server.

```ts
// ON USER A's MACHINE: Export changes
const changeset = await db.getChangeset();
// `changeset` is a string. Commit it to Git, save it, send it.
// e.g., fs.writeFileSync('update-v2.patch', changeset);

// ON USER B'S MACHINE: Import changes
// const changeset = fs.readFileSync('update-v2.patch', 'utf-8');
await db.applyChangeset(changeset);

// Done. User B's database is now synced, and their UI updates.
```

## 🧰 API Deep Dive

The API surface is minimal and powerful.

`createLiveDB(crSqliteDb, { schema })`
: The main factory. Takes a raw CR-SQLite instance and your Drizzle schema. Returns the `Opor` instance.

`db.liveQuery(queryBuilder)`
: The reactive heart.
: - `queryBuilder`: `(db) => drizzleQuery` - A function where you build your Drizzle query.
: - **Returns:** A `LiveResult` object: `{ data, loading, error, subscribe, refetch, destroy }`.

`db.sync({ endpoint, ... })`
: Initiates continuous, real-time sync.

`db.getChangeset()`
: Generates a changeset (diff) of all local database modifications. Returns a `Promise<string>`.

`db.applyChangeset(changeset)`
: Applies a changeset from a peer to the local database. Returns `Promise<void>`.

`migrate(db, { migrationsFolder })`
: A Drizzle Kit-compatible migrator to manage schema evolution.

*All standard Drizzle methods (`db.select`, `db.insert`, `db.transaction`, etc.) are available directly on the `db` instance and work as expected.*

## 🧩 Framework Cookbooks

Bridging `opor` to your UI is trivial.

<details>
<summary><strong>⚛️ React / React Native</strong></summary>

The recommended approach is to use React's built-in `useSyncExternalStore` for a perfect, tear-free subscription.

```ts
// src/hooks/useLiveQuery.ts
import { useMemo, useSyncExternalStore } from 'react';

export function useLiveQuery(queryFactory) {
  // useMemo ensures the query is created only once
  const liveQuery = useMemo(queryFactory, [queryFactory]);

  const data = useSyncExternalStore(
    liveQuery.subscribe,
    () => liveQuery.data
  );

  // Optional: You could also expose loading/error states from the query object
  return { data };
}
```
</details>

<details>
<summary><strong>🔥 Svelte</strong></summary>

Svelte's stores are a match made in heaven.

```ts
// src/lib/stores/live.ts
import { readable } from 'svelte/store';

export function fromLiveQuery(liveQuery) {
  return readable(liveQuery.data, (set) => {
    const unsubscribe = liveQuery.subscribe(set);
    // On cleanup, unsubscribe and destroy the underlying query
    return () => {
      unsubscribe();
      liveQuery.destroy();
    };
  });
}```
**Usage in a component:**
```html
<script>
  import { db } from '$lib/db';
  import { fromLiveQuery } from '$lib/stores/live';

  const posts = fromLiveQuery(db.liveQuery(d => d.query.posts.findMany()));
</script>

{#each $posts || [] as post}
  <p>{post.title}</p>
{/each}
```
</details>

<details>
<summary><strong>💚 Vue</strong></summary>

Use a `ref` and Vue's lifecycle hooks.

```ts
// src/composables/useLiveQuery.ts
import { ref, onUnmounted } from 'vue';

export function useLiveQuery(queryFactory) {
  const liveQuery = queryFactory();
  const data = ref(liveQuery.data);

  const unsubscribe = liveQuery.subscribe(newValue => {
    data.value = newValue;
  });

  onUnmounted(() => {
    unsubscribe();
    liveQuery.destroy();
  });

  return { data };
}
```
</details>

## 🤔 Core Design Principles

1.  **Local-First is the Future:** The user's data should belong to them. It should live on their device, making apps faster, more reliable, and available offline.
2.  **Complexity is the Enemy:** We abstract away the monumental complexity of CRDTs, database reactivity, and network protocols behind an API that is a joy to use.
3.  **Embrace Composability:** Inspired by Drizzle's own design, we use Higher-Order Functions and a minimal API to give you powerful building blocks, not a restrictive framework.
4.  **Flexibility over Dogma:** We provide both real-time and snapshot-based sync because the "right" architecture depends on your product's needs.

## 📦 Installation

```bash
npm install drizzle-orm @vlcn.io/crsqlite-wasm opor
```

You will also need to configure your bundler (Vite, Webpack) to correctly handle the WASM assets from `@vlcn.io/crsqlite-wasm`. Please refer to the [VLCN documentation](https://vlcn.io/docs) for setup instructions.

## 🤝 Contributing

This is an ambitious project, and we welcome contributors. Whether it's documentation, bug reports, feature ideas, or pull requests, your help is invaluable.

1.  **Open an Issue:** Discuss the change you want to make.
2.  **Fork the Repo** and create your branch.
3.  **Make a Pull Request** with a clear description of your changes.

---

<div align="center">
  Built with ❤️ for a web that is faster, more resilient, and more collaborative.
</div>
