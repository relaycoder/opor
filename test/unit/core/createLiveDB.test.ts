import { describe, it, expect } from 'bun:test';
import { createLiveDB } from '../../../src/driver';
import { createTestDB, testSchema } from '../../test.util';
import type { DB } from '@vlcn.io/crsqlite-wasm';

describe('createLiveDB', () => {
  it('should return an object that combines the Drizzle DB instance and opor-specific methods', async () => {
    const db = await createTestDB();
    
    expect(db.select).toBeInstanceOf(Function);
    expect(db.insert).toBeInstanceOf(Function);
    expect(db.update).toBeInstanceOf(Function);
    expect(db.delete).toBeInstanceOf(Function);
    
    expect(db.liveQuery).toBeInstanceOf(Function);
    expect(db.sync).toBeInstanceOf(Function);
    expect(db.getChangeset).toBeInstanceOf(Function);
    expect(db.applyChangeset).toBeInstanceOf(Function);
    expect(db.crSqlite).toBeDefined();
  });

  it('should expose all standard Drizzle methods (select, insert, update, delete, etc.)', async () => {
    const db = await createTestDB();
    const statement = db.select().from(testSchema.users);
    expect(statement.toSQL().sql).toBe('select "id", "name", "email" from "users"');
    const result = await statement;
    expect(result).toEqual([]);
  });

  it('should expose `liveQuery`, `sync`, `getChangeset`, and `applyChangeset` methods', async () => {
    const db = await createTestDB();
    expect(db.liveQuery).toBeInstanceOf(Function);
    expect(db.sync).toBeInstanceOf(Function);
    expect(db.getChangeset).toBeInstanceOf(Function);
    expect(db.applyChangeset).toBeInstanceOf(Function);
  });

  it('should throw an error if not provided a valid CR-SQLite database instance', () => {
    // @ts-expect-error - Testing invalid input
    expect(() => createLiveDB(null)).toThrow();
    // @ts-expect-error - Testing invalid input
    expect(() => createLiveDB(undefined)).toThrow();
    // @ts-expect-error - Testing invalid input
    expect(() => createLiveDB({} as DB)).toThrow();
  });

  it('should not throw an error if not provided a Drizzle schema', async () => {
    const db = await createTestDB();
    const crSqliteInstance = db.crSqlite;
    
    expect(() => createLiveDB(crSqliteInstance)).not.toThrow();
  });
});