import { describe, it, expect, beforeEach, beforeAll } from 'bun:test';
import { createTestDB, testSchema, users, posts, waitFor, initCRSQLite } from '../../test.util';
import type { OporDatabase } from '../../../src/types';
import { eq } from 'drizzle-orm';
import { sqliteTable, text } from 'drizzle-orm/sqlite-core';

let db: OporDatabase<typeof testSchema>;

beforeAll(async () => {
    await initCRSQLite();
});

beforeEach(async () => {
  db = await createTestDB();
});

describe('liveQuery', () => {
  it('should return a live result object with initial data, loading, and error states', async () => {
    const query = db.liveQuery((db) => db.select().from(users));

    expect(query.data).toBeUndefined();
    expect(query.loading).toBe(true);
    expect(query.error).toBeUndefined();
    
    await waitFor(query, (data) => data !== undefined);

    expect(query.data).toEqual([]);
    expect(query.loading).toBe(false);
    expect(query.error).toBeUndefined();
  });

  it('should allow subscribing and unsubscribing to data changes', async () => {
    let callCount = 0;
    const query = db.liveQuery((db) => db.select().from(users));
    
    await waitFor(query, (data) => data !== undefined);

    const unsubscribe = query.subscribe(() => {
      callCount++;
    });

    expect(callCount).toBe(1);

    await db.insert(users).values({ id: '1', name: 'Alice', email: 'alice@example.com' });

    await waitFor(query, (data) => data?.length === 1);
    expect(callCount).toBe(2);

    unsubscribe();
    
    await db.insert(users).values({ id: '2', name: 'Bob', email: 'bob@example.com' });
    await waitFor(query, (data) => data?.length === 2);
    
    expect(callCount).toBe(2);
  });

  it('should call the subscriber with initial data immediately upon subscription', async () => {
    await db.insert(users).values({ id: '1', name: 'Alice', email: 'alice@example.com' });
    
    const query = db.liveQuery((db) => db.select().from(users));
    await waitFor(query, (data) => data?.length === 1);

    let receivedData: unknown;
    query.subscribe((data) => {
      receivedData = data;
    });

    expect(receivedData).toEqual([{ id: '1', name: 'Alice', email: 'alice@example.com' }]);
  });

  it('should have a destroy method to clean up resources', async () => {
    const query = db.liveQuery((db) => db.select().from(users));
    await waitFor(query, data => data !== undefined);

    expect(() => query.destroy()).not.toThrow();
  });
  
  it('should correctly handle queries with joins and complex conditions', async () => {
    await db.insert(users).values({ id: '1', name: 'Alice', email: 'a@a.com' });
    await db.insert(posts).values({ id: 'p1', title: 'Post 1', userId: '1' });
    await db.insert(posts).values({ id: 'p2', title: 'Post 2', userId: '1' });
    await db.insert(users).values({ id: '2', name: 'Bob', email: 'b@b.com' });
    await db.insert(posts).values({ id: 'p3', title: 'Post 3', userId: '2' });

    const query = db.liveQuery(db => 
      db.select({ userName: users.name, postTitle: posts.title })
        .from(users)
        .leftJoin(posts, eq(users.id, posts.userId))
        .where(eq(users.id, '1'))
    );

    const result = await waitFor(query, data => data?.length === 2);
    
    expect(result).toContainEqual({ userName: 'Alice', postTitle: 'Post 1' });
    expect(result).toContainEqual({ userName: 'Alice', postTitle: 'Post 2' });
  });

  it('should handle errors during query execution and report them via the `error` property', async () => {
    const badSchema = { badTable: sqliteTable('bad_table', {id: text('id')})};
    const query = db.liveQuery(db => db.select().from(badSchema.badTable));
    
    await waitFor(query, () => !query.loading);

    expect(query.data).toBeUndefined();
    expect(query.error).toBeInstanceOf(Error);
    expect(query.error?.message).toContain('no such table: bad_table');
    expect(query.loading).toBe(false);
  });
});