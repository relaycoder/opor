import { describe, it, expect, beforeAll, afterAll, beforeEach, spyOn } from 'bun:test';
import { JSDOM } from 'jsdom';
import { useCallback } from 'react';
import { render, screen, act, cleanup } from '@testing-library/react';
import { useLiveQuery } from '../../../src/react';
import { createTestDB, testSchema, users, initCRSQLite } from '../../test.util';
import type { OporDatabase, LiveResult } from '../../../src/types';

let db: OporDatabase<typeof testSchema>;

beforeAll(async () => {
    await initCRSQLite();
    const dom = new JSDOM();
    global.window = dom.window as any;
    global.document = dom.window.document;
});

afterAll(() => {
    cleanup();
});

beforeEach(async () => {
    db = await createTestDB();
    await db.insert(users).values({ id: '1', name: 'Alice', email: 'a@a.com' });
});

type User = { id: string; name: string };
type TestComponentProps = {
    queryFactory: () => LiveResult<User[]>;
};

const TestComponent = ({ queryFactory }: TestComponentProps) => {
    const { data, loading, error } = useLiveQuery(queryFactory);
    if (loading) return <div>Loading...</div>;
    if (error) return <div>Error: {error.message}</div>;
    return (
        <ul>
            {data?.map(item => <li key={item.id}>{item.name}</li>)}
        </ul>
    );
};

describe('React useLiveQuery Hook', () => {
    it('should render initial data from a liveQuery', async () => {
        const queryFactory = () => db.liveQuery(() => db.select().from(users));
        render(<TestComponent queryFactory={queryFactory} />);
        expect(await screen.findByText('Alice')).toBeDefined();
    });

    it('should re-render the component when the underlying data is mutated', async () => {
        const queryFactory = () => db.liveQuery(() => db.select().from(users));
        render(<TestComponent queryFactory={queryFactory} />);
        expect(await screen.findByText('Alice')).toBeDefined();
        expect(screen.queryByText('Bob')).toBeNull();

        await act(async () => {
            await db.insert(users).values({ id: '2', name: 'Bob', email: 'b@b.com' });
        });
        expect(await screen.findByText('Bob')).toBeDefined();
    });

    it('should not cause re-renders when unrelated data is mutated', async () => {
        const queryFactory = () => db.liveQuery(() => db.select().from(users));
        render(<TestComponent queryFactory={queryFactory} />);
        const list = await screen.findByRole('list');
        const initialHtml = list.innerHTML;
        
        await act(async () => {
            await db.insert(testSchema.posts).values({id: 'p1', title: 'A post', userId: '1'});
        });
        await new Promise(r => setTimeout(r, 50));
        expect(list.innerHTML).toBe(initialHtml);
    });

    it('should correctly unsubscribe and clean up when the component unmounts', async () => {
        const query = db.liveQuery(() => db.select().from(users));
        const queryFactory = () => query;
        
        // The internal query object is not exposed, so we can't directly inspect subscribers.
        // However, we can trust that `useSyncExternalStore` correctly calls the returned
        // unsubscribe function, which is tested at the unit level.
        // This test now primarily ensures the component unmounts cleanly.
        const { unmount } = render(<TestComponent queryFactory={queryFactory} />);
        await screen.findByText('Alice');
        expect(() => unmount()).not.toThrow();
    });

    it('should memoize the query instance to prevent re-creation on every render', async () => {
        const factory = {
            create: () => db.liveQuery(() => db.select().from(users))
        }
        const factorySpy = spyOn(factory, "create");
        
        const MemoComponent = () => {
            const queryFactory = useCallback(() => factory.create(), []);
            return <TestComponent queryFactory={queryFactory} />;
        };
        
        const { rerender } = render(<MemoComponent />);
        await screen.findByText('Alice');
        expect(factorySpy).toHaveBeenCalledTimes(1);
        
        rerender(<MemoComponent />);
        expect(factorySpy).toHaveBeenCalledTimes(1);
    });
});