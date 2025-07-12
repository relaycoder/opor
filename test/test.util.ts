import { afterAll } from "bun:test";
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { createLiveDB } from "../src/driver";
import type { LiveResult, OporDatabase } from "../src/types";
import CRSQLite from '@vlcn.io/crsqlite-wasm';

const CRSQLiteModule = await CRSQLite();

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').unique(),
});

export const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  title: text('title').notNull(),
  userId: text('user_id').notNull().references(() => users.id),
});

export const comments = sqliteTable('comments', {
    id: text('id').primaryKey(),
    text: text('text').notNull(),
    postId: text('post_id').notNull().references(() => posts.id),
});

export const testSchema = {
    users,
    posts,
    comments,
};

const dbsToClose: { close: () => void }[] = [];

afterAll(() => {
    dbsToClose.forEach(db => db.close());
    dbsToClose.length = 0;
});

export async function createTestDB(options: {
    dbName?: string,
    createSchema?: boolean
} = {}): Promise<OporDatabase<typeof testSchema>> {
    const { dbName = `test-db-${crypto.randomUUID()}.db`, createSchema = true } = options;
    const crSqliteDb = await CRSQLiteModule.open(dbName);

    const db = createLiveDB(crSqliteDb, { schema: testSchema });
    dbsToClose.push(crSqliteDb);

    if (createSchema) {
        await db.session.exec(`CREATE TABLE users (id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE);`);
        await db.session.exec(`CREATE TABLE posts (id TEXT PRIMARY KEY, title TEXT NOT NULL, user_id TEXT NOT NULL, FOREIGN KEY (user_id) REFERENCES users(id));`);
        await db.session.exec(`CREATE TABLE comments (id TEXT PRIMARY KEY, text TEXT NOT NULL, post_id TEXT NOT NULL, FOREIGN KEY (post_id) REFERENCES posts(id));`);
    }

    return db;
}

export function waitFor<T>(
    liveResult: LiveResult<T>,
    predicate: (data: T | undefined) => boolean,
    timeout = 1000
): Promise<T> {
    return new Promise((resolve, reject) => {
        if (predicate(liveResult.data)) {
            resolve(liveResult.data!);
            return;
        }

        const timeoutId = setTimeout(() => {
            sub();
            reject(new Error(`Timed out waiting for condition. Last seen data: ${JSON.stringify(liveResult.data)}`));
        }, timeout);

        const sub = liveResult.subscribe((data) => {
            if (predicate(data)) {
                sub();
                clearTimeout(timeoutId);
                resolve(data);
            }
        });
    });
}