import { describe, it, expect, afterEach, beforeAll } from 'bun:test';
import { createTestDB, initCRSQLite } from '../../test.util';
import type { OporDatabase } from '../../../src/types';
import { migrate } from '../../../src/migrator';
import type { MigrationMeta } from 'drizzle-orm/migrator';
import { sql } from 'drizzle-orm';

let db: OporDatabase<any>;

beforeAll(async () => {
    await initCRSQLite();
});

afterEach(async () => {
    if (db) {
        await db.crSqlite.close();
    }
});

const MIGRATIONS: MigrationMeta[] = [
    {
        sql: [
            "CREATE TABLE `customers` (`id` text PRIMARY KEY NOT NULL, `name` text NOT NULL);",
            "CREATE TABLE `orders` (`id` text PRIMARY KEY NOT NULL, `item` text, `customer_id` text);"
        ],
        folderMillis: 1700000000000,
        hash: 'hash1',
        bps: false,
    },
    {
        sql: ["ALTER TABLE `orders` ADD COLUMN `quantity` integer DEFAULT 1;"],
        folderMillis: 1700000000001,
        hash: 'hash2',
        bps: false,
    }
];

describe('Migrations', () => {
    it('should apply new migrations to an empty database', async () => {
        db = await createTestDB({ createSchema: false });
        await migrate(db, { migrations: MIGRATIONS });
        
        const customers = await db.get(sql`SELECT name FROM sqlite_master WHERE type='table' AND name='customers';`);
        expect(customers).toBeDefined();
        
        const ordersInfo = await db.all(sql`PRAGMA table_info(orders)`);
        expect((ordersInfo as any[]).some(col => col.name === 'quantity')).toBe(true);

        const appliedMigrations = await db.all(sql`SELECT * FROM __drizzle_migrations`);
        expect(appliedMigrations.length).toBe(2);
    });

    it('should apply pending migrations to an existing database', async () => {
        db = await createTestDB({ createSchema: false });
        
        await migrate(db, { migrations: [MIGRATIONS[0]!] });
        let appliedMigrations = await db.all(sql`SELECT * FROM __drizzle_migrations`);
        expect(appliedMigrations.length).toBe(1);

        await migrate(db, { migrations: MIGRATIONS });
        appliedMigrations = await db.all(sql`SELECT * FROM __drizzle_migrations`);
        expect(appliedMigrations.length).toBe(2);
    });

    it('should not re-apply already applied migrations', async () => {
        db = await createTestDB({ createSchema: false });
        
        await migrate(db, { migrations: MIGRATIONS });
        let appliedCount = (await db.all(sql`SELECT * FROM __drizzle_migrations`)).length;
        expect(appliedCount).toBe(2);

        await migrate(db, { migrations: MIGRATIONS });
        let newAppliedCount = (await db.all(sql`SELECT * FROM __drizzle_migrations`)).length;
        expect(newAppliedCount).toBe(appliedCount);
    });

    it('should correctly update the database schema, allowing new queries to work', async () => {
        db = await createTestDB({ createSchema: false });
        await migrate(db, { migrations: MIGRATIONS });

        const insertAndSelect = async () => {
            await db.run(sql`INSERT INTO customers (id, name) VALUES ('c1', 'test')`);
            await db.run(sql`INSERT INTO orders (id, item, customer_id, quantity) VALUES ('o1', 'thing', 'c1', 5)`);
            return db.get(sql`SELECT quantity FROM orders WHERE id = 'o1'`);
        }

        await expect(insertAndSelect()).resolves.toEqual({ quantity: 5 });
    });
});