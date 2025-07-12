import { describe, it, expect, beforeEach } from 'bun:test';
import { createTestDB, testSchema, users } from '../../test.util';
import type { OporDatabase } from '../../../src/types';

let db: OporDatabase<typeof testSchema>;
let db2: OporDatabase<typeof testSchema>;

beforeEach(async () => {
  db = await createTestDB({dbName: 'db1.db'});
  db2 = await createTestDB({dbName: 'db2.db'});
});

describe('Snapshot Sync', () => {
  it('should generate a non-empty changeset after mutations', async () => {
    await db.insert(users).values({ id: '1', name: 'Alice', email: 'a@a.com' });
    const changeset = await db.getChangeset();
    
    expect(changeset).toBeTypeOf('string');
    expect(changeset.length).toBeGreaterThan(0);
    
    const parsed = JSON.parse(changeset);
    expect(parsed).toBeInstanceOf(Array);
    expect(parsed.length).toBe(3);
  });

  it('should generate an empty changeset when there are no changes', async () => {
    const changeset = await db.getChangeset();
    const parsed = JSON.parse(changeset);
    expect(parsed).toEqual([]);
  });

  it('should apply a valid changeset to a database instance', async () => {
    await db.insert(users).values({ id: '1', name: 'Alice', email: 'a@a.com' });
    const changeset = await db.getChangeset();

    let usersInDb2 = await db2.select().from(users);
    expect(usersInDb2).toEqual([]);

    await db2.applyChangeset(changeset);

    usersInDb2 = await db2.select().from(users);
    expect(usersInDb2.length).toBe(1);
    expect(usersInDb2[0].name).toBe('Alice');
  });

  it('should throw an error when applying an invalid or corrupt changeset', async () => {
    const invalidChangeset1 = 'this is not json';
    const invalidChangeset2 = JSON.stringify({ not: 'a changeset' });
    const invalidChangeset3 = JSON.stringify([['table', 'pk', 1, 2, 3]]);

    await expect(db.applyChangeset(invalidChangeset1)).rejects.toThrow();
    await expect(db.applyChangeset(invalidChangeset2)).rejects.toThrow('Invalid changeset format.');
    await expect(db.applyChangeset(invalidChangeset3)).rejects.toThrow('Invalid changeset format.');
  });

  it('should correctly merge changes from a changeset without data loss', async () => {
    await db.insert(users).values({ id: '1', name: 'Alice', email: 'a@a.com' });
    await db2.insert(users).values({ id: '2', name: 'Bob', email: 'b@b.com' });

    const changeset1 = await db.getChangeset();
    await db2.applyChangeset(changeset1);

    const usersInDb2 = await db2.select().from(users).orderBy(users.name);
    expect(usersInDb2.length).toBe(2);
    expect(usersInDb2[0].name).toBe('Alice');
    expect(usersInDb2[1].name).toBe('Bob');
  });
});