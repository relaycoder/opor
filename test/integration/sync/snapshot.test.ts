import { describe, it, expect, beforeEach, beforeAll } from 'bun:test';
import { createTestDB, testSchema, users, waitFor, initCRSQLite } from '../../test.util';
import type { OporDatabase } from '../../../src/types';
import { eq } from 'drizzle-orm';

let clientA: OporDatabase<typeof testSchema>;
let clientB: OporDatabase<typeof testSchema>;

beforeAll(async () => {
    await initCRSQLite();
});

beforeEach(async () => {
  clientA = await createTestDB({ dbName: 'clientA.db' });
  clientB = await createTestDB({ dbName: 'clientB.db' });
});

describe('Snapshot Sync Workflow', () => {
  it('should sync two database instances using the get/apply changeset flow', async () => {
    await clientA.insert(users).values({ id: '1', name: 'Alice', email: 'a@a.com' });
    const changeset = await clientA.getChangeset();
    await clientB.applyChangeset(changeset);
    
    const aliceOnB = await clientB.select().from(users).where(eq(users.id, '1'));
    expect(aliceOnB.length).toBe(1);
    expect(aliceOnB[0]!.name).toBe('Alice');
  });

  it('should correctly update a liveQuery on the receiving client after applyChangeset is called', async () => {
    const queryB = clientB.liveQuery(db => db.select().from(users));
    await waitFor(queryB, d => d !== undefined);
    expect(queryB.data).toEqual([]);
    
    await clientA.insert(users).values({ id: '1', name: 'Alice', email: 'a@a.com' });
    const changeset = await clientA.getChangeset();
    
    await clientB.applyChangeset(changeset);
    
    await waitFor(queryB, d => d?.length === 1);
    expect(queryB.data![0]!.name).toBe('Alice');
  });

  it('should handle multiple rounds of changeset application correctly', async () => {
    await clientA.insert(users).values({ id: '1', name: 'Alice', email: 'a@a.com' });
    let changeset = await clientA.getChangeset();
    await clientB.applyChangeset(changeset);

    let usersOnB = await clientB.select().from(users);
    expect(usersOnB.length).toBe(1);

    await clientA.insert(users).values({ id: '2', name: 'Bob', email: 'b@b.com' });
    changeset = await clientA.getChangeset();
    await clientB.applyChangeset(changeset);
    
    usersOnB = await clientB.select().from(users);
    expect(usersOnB.length).toBe(2);
  });

  it('should allow a client to get a changeset, reset its DB, and re-apply the changeset to reach the same state', async () => {
    await clientA.insert(users).values({ id: '1', name: 'Alice', email: 'a@a.com' });
    await clientA.insert(users).values({ id: '2', name: 'Bob', email: 'b@b.com' });
    const changeset = await clientA.getChangeset();

    await clientB.delete(users);
    let usersOnB = await clientB.select().from(users);
    expect(usersOnB.length).toBe(0);

    await clientB.applyChangeset(changeset);
    usersOnB = await clientB.select().from(users).orderBy(users.name);
    expect(usersOnB.length).toBe(2);
    expect(usersOnB[0]!.name).toBe('Alice');
  });
});