import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'bun:test';
import { createTestDB, testSchema, users, waitFor } from '../../test.util';
import type { OporDatabase } from '../../../src/types';
import type { ServerWebSocket } from 'bun';

const PORT = 8001;
const ENDPOINT = `ws://localhost:${PORT}`;

let server: ReturnType<typeof Bun.serve>;
const allSockets = new Map<string, Set<ServerWebSocket>>();

beforeAll(() => {
    server = Bun.serve({
        port: PORT,
        fetch(req, server) {
            const url = new URL(req.url);
            const dbName = url.searchParams.get('dbName');
            if (!dbName) return new Response("dbName required", { status: 400 });

            const authToken = req.headers.get('Authorization');
            if (authToken !== 'test-token') return new Response('Unauthorized', { status: 401 });

            const success = server.upgrade(req, { data: { dbName } });
            return success ? undefined : new Response("Upgrade failed", { status: 500 });
        },
        websocket: {
            open(ws) {
                const { dbName } = ws.data;
                if (!allSockets.has(dbName)) allSockets.set(dbName, new Set());
                allSockets.get(dbName)!.add(ws);
            },
            close(ws) {
                const { dbName } = ws.data;
                allSockets.get(dbName)?.delete(ws);
            },
            message(ws, message) {
                const { dbName } = ws.data;
                const sockets = allSockets.get(dbName);
                if (!sockets) return;
                for (const otherWs of sockets) {
                    if (ws !== otherWs) otherWs.send(message);
                }
            },
        },
    });
});

afterAll(() => {
    server.stop(true);
});

describe('Live Sync', () => {
    let clientA: OporDatabase<typeof testSchema>;
    let clientB: OporDatabase<typeof testSchema>;

    beforeEach(async () => {
        clientA = await createTestDB({ dbName: 'clientA.db' });
        clientB = await createTestDB({ dbName: 'clientB.db' });
        allSockets.clear();
    });

    it('should connect to a mock sync server and sync an insert', async () => {
        const queryB = clientB.liveQuery(db => db.select().from(users));
        await waitFor(queryB, d => d !== undefined);
        expect(queryB.data?.length).toBe(0);

        const syncOptions = { endpoint: ENDPOINT, dbName: 'test-db-insert', authToken: 'test-token' };
        await Promise.all([ clientA.sync(syncOptions), clientB.sync(syncOptions) ]);

        await clientA.insert(users).values({ id: '1', name: 'Live Alice', email: 'la@la.com' });

        await waitFor(queryB, d => d?.length === 1);
        expect(queryB.data?.[0].name).toBe('Live Alice');
    });
    
    it('should sync an update from client A to client B', async () => {
        const syncOptions = { endpoint: ENDPOINT, dbName: 'test-db-update', authToken: 'test-token' };
        await Promise.all([ clientA.sync(syncOptions), clientB.sync(syncOptions) ]);
        
        await clientA.insert(users).values({ id: 'u1', name: 'Update-Me', email: 'u@u.com' });
        const queryB = clientB.liveQuery(db => db.select().from(users).where({id: 'u1'}));
        await waitFor(queryB, d => d?.[0]?.name === 'Update-Me');
        
        await clientA.update(users).set({ name: 'Updated' }).where({ id: 'u1' });
        await waitFor(queryB, d => d?.[0]?.name === 'Updated');
        expect(queryB.data?.[0].name).toBe('Updated');
    });

    it('should sync a delete from client A to client B', async () => {
        const syncOptions = { endpoint: ENDPOINT, dbName: 'test-db-delete', authToken: 'test-token' };
        await Promise.all([ clientA.sync(syncOptions), clientB.sync(syncOptions) ]);
        await clientA.insert(users).values({ id: 'd1', name: 'Delete-Me', email: 'd@d.com' });
        
        const queryB = clientB.liveQuery(db => db.select().from(users));
        await waitFor(queryB, d => d?.length === 1);

        await clientA.delete(users).where({ id: 'd1' });
        await waitFor(queryB, d => d?.length === 0);
        expect(queryB.data).toEqual([]);
    });

    it('should sync changes that occurred while a client was offline', async () => {
        await clientA.insert(users).values({ id: 'offline-user', name: 'Offline', email: 'o@o.com'});

        const syncOptions = { endpoint: ENDPOINT, dbName: 'test-db-offline', authToken: 'test-token' };
        await clientA.sync(syncOptions);
        await clientB.sync(syncOptions);

        const queryB = clientB.liveQuery(db => db.select().from(users));
        await waitFor(queryB, d => d?.length === 1);
        expect(queryB.data?.[0].name).toBe('Offline');
    });
});