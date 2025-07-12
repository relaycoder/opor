import { describe, it, expect, beforeEach, beforeAll } from 'bun:test';
import { createTestDB, testSchema, users, posts, waitFor, initCRSQLite } from '../../test.util';
import type { OporDatabase } from '../../../src/types';
import { eq } from 'drizzle-orm';

let db: OporDatabase<typeof testSchema>;

beforeAll(async () => {
    await initCRSQLite();
});

beforeEach(async () => {
  db = await createTestDB();
  await db.insert(users).values([
    { id: '1', name: 'Alice', email: 'a@a.com' },
    { id: '2', name: 'Bob', email: 'b@b.com' },
  ]);
});

describe('Core Reactivity Loop', () => {
  it('should trigger a liveQuery subscriber when an insert mutation matches the query', async () => {
    const query = db.liveQuery(db => db.select().from(users));
    await waitFor(query, d => d?.length === 2);

    let callCount = 0;
    query.subscribe(() => callCount++);
    expect(callCount).toBe(1);

    await db.insert(users).values({ id: '3', name: 'Charlie', email: 'c@c.com' });
    
    await waitFor(query, d => d?.length === 3);
    expect(callCount).toBe(2);
    expect(query.data?.find(u => u.id === '3')?.name).toBe('Charlie');
  });

  it('should trigger a liveQuery subscriber when an update mutation affects a row matching the query', async () => {
    const query = db.liveQuery(db => db.select().from(users).where(eq(users.id, '1')));
    await waitFor(query, d => d?.length === 1);
    expect(query.data![0]!.name).toBe('Alice');

    let callCount = 0;
    query.subscribe(() => callCount++);
    expect(callCount).toBe(1);

    await db.update(users).set({ name: 'Alicia' }).where(eq(users.id, '1'));

    await waitFor(query, d => d?.[0]!.name === 'Alicia');
    expect(callCount).toBe(2);
    expect(query.data![0]!.name).toBe('Alicia');
  });

  it('should trigger a liveQuery subscriber when a delete mutation removes a row matching the query', async () => {
    const query = db.liveQuery(db => db.select().from(users));
    await waitFor(query, d => d?.length === 2);

    let callCount = 0;
    query.subscribe(() => callCount++);
    expect(callCount).toBe(1);

    await db.delete(users).where(eq(users.id, '1'));
    
    await waitFor(query, d => d?.length === 1);
    expect(callCount).toBe(2);
    expect(query.data?.find(u => u.id === '1')).toBeUndefined();
  });

  it('should NOT trigger a liveQuery subscriber notification when a mutation does NOT affect the query result set', async () => {
    const query = db.liveQuery(db => db.select().from(users).where(eq(users.name, 'Alice')));
    await waitFor(query, d => d?.length === 1);

    let callCount = 0;
    query.subscribe(() => callCount++);
    expect(callCount).toBe(1);

    await db.update(users).set({ name: 'Robert' }).where(eq(users.id, '2'));
    await db.insert(posts).values({ id: 'p1', title: 'Post', userId: '1' });
    
    await new Promise(r => setTimeout(r, 50)); 
    
    expect(callCount).toBe(1);
  });

  it('should handle multiple liveQuery instances observing different data slices', async () => {
    const aliceQuery = db.liveQuery(db => db.select().from(users).where(eq(users.name, 'Alice')));
    const bobQuery = db.liveQuery(db => db.select().from(users).where(eq(users.name, 'Bob')));
    await Promise.all([
        waitFor(aliceQuery, d => d?.length === 1),
        waitFor(bobQuery, d => d?.length === 1),
    ]);

    let aliceCalls = 0;
    aliceQuery.subscribe(() => aliceCalls++);
    let bobCalls = 0;
    bobQuery.subscribe(() => bobCalls++);
    expect(aliceCalls).toBe(1);
    expect(bobCalls).toBe(1);
    
    await db.update(users).set({ email: 'new-a@a.com' }).where(eq(users.name, 'Alice'));

    await waitFor(aliceQuery, d => d?.[0]!.email === 'new-a@a.com');

    expect(aliceCalls).toBe(2);
    expect(bobCalls).toBe(1);
  });

  it('should correctly reflect changes within a db.transaction() call after it completes', async () => {
    const query = db.liveQuery(db => db.select().from(users));
    await waitFor(query, d => d?.length === 2);

    let callCount = 0;
    query.subscribe(() => callCount++);
    expect(callCount).toBe(1);

    await db.transaction(async (tx) => {
        await tx.insert(users).values({ id: '3', name: 'Charlie', email: 'c@c.com' });
        await tx.delete(users).where(eq(users.id, '1'));
        
        expect(query.data?.length).toBe(2);
        expect(callCount).toBe(1);
    });

    await waitFor(query, d => d?.length === 2 && !!d.find(u => u.id === '3'));
    expect(callCount).toBe(2);
    expect(query.data?.find(u => u.id === '1')).toBeUndefined();
    expect(query.data?.find(u => u.id === '3')).toBeDefined();
  });
});