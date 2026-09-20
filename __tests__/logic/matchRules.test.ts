import { joinMatch } from '../../services/firestore';

// Mock Firebase
const mockRunTransaction = jest.fn();
const mockDoc = jest.fn();
const mockCollection = jest.fn();
const mockAddDoc = jest.fn(); // For waitlist notification

jest.mock('firebase/firestore', () => ({
    getFirestore: jest.fn(),
    doc: (...args: any[]) => mockDoc(...args),
    collection: (...args: any[]) => mockCollection(...args),
    addDoc: (...args: any[]) => mockAddDoc(...args),
    runTransaction: (db: any, updateFunction: any) => mockRunTransaction(db, updateFunction),
    serverTimestamp: () => 'mock-timestamp',
    query: jest.fn(),
    where: jest.fn(),
    orderBy: jest.fn(),
    limit: jest.fn(),
    getDocs: jest.fn(() => Promise.resolve({ empty: true, docs: [] })), // Default empty for validation checks
}));

jest.mock('../../firebaseConfig', () => ({
    db: {},
}));

describe('Match Rules - Join Logic', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('joinMatch throws MATCH_FULL if capacity is reached', async () => {
        // Mock transaction behavior
        mockRunTransaction.mockImplementation(async (db, transactionFn) => {
            const mockTransaction = {
                get: jest.fn().mockImplementation((ref) => {
                    if (ref.path === 'matches/match1') {
                        return Promise.resolve({
                            exists: () => true,
                            data: () => ({ maxPlayers: 14, playerCount: 14 }) // FULL
                        });
                    }
                    if (ref.path.startsWith('match_participants')) {
                        return Promise.resolve({ exists: () => false }); // User not in match
                    }
                    return Promise.resolve({ exists: () => false });
                }),
                update: jest.fn(),
                set: jest.fn(),
            };
            return transactionFn(mockTransaction);
        });

        // Setup mock doc refs
        mockDoc.mockImplementation((db, col, id) => ({ path: `${col}/${id}` }));

        await expect(joinMatch('match1', 'user1', 'User 1', 'IN'))
            .rejects.toThrow('MATCH_FULL');
    });

    test('joinMatch allows joining if capacity is valid', async () => {
        // Mock transaction behavior
        mockRunTransaction.mockImplementation(async (db, transactionFn) => {
            const mockTransaction = {
                get: jest.fn().mockImplementation((ref) => {
                    if (ref.path === 'matches/match1') {
                        return Promise.resolve({
                            exists: () => true,
                            data: () => ({ maxPlayers: 14, playerCount: 13 }) // NOT FULL
                        });
                    }
                    return Promise.resolve({ exists: () => false });
                }),
                update: jest.fn(),
                set: jest.fn(),
            };
            await transactionFn(mockTransaction);
            return;
        });

        mockDoc.mockImplementation((db, col, id) => ({ path: `${col}/${id}` }));

        await expect(joinMatch('match1', 'user1', 'User 1', 'IN')).resolves.not.toThrow();
    });

    test('joinMatch allows existing player to toggle IN (idempotent)', async () => {
        // Even if full, if I am already IN, I should stay IN (or update details) without error
        // Logic says: if (status === 'IN' && oldStatus !== 'IN') check capacity.
        // So if oldStatus === 'IN', it skips capacity check.

        mockRunTransaction.mockImplementation(async (db, transactionFn) => {
            const mockTransaction = {
                get: jest.fn().mockImplementation((ref) => {
                    if (ref.path === 'matches/match1') {
                        return Promise.resolve({
                            exists: () => true,
                            data: () => ({ maxPlayers: 14, playerCount: 14 }) // FULL
                        });
                    }
                    if (ref.path.includes('user1')) {
                        return Promise.resolve({
                            exists: () => true,
                            data: () => ({ status: 'IN' }) // Already IN
                        });
                    }
                    return Promise.resolve({ exists: () => false });
                }),
                update: jest.fn(),
                set: jest.fn(),
            };
            await transactionFn(mockTransaction);
        });

        mockDoc.mockImplementation((db, col, id) => ({ path: `${col}/${id}` }));

        await expect(joinMatch('match1', 'user1', 'User 1', 'IN')).resolves.not.toThrow();
    });

    test('joinMatch allows joining toggle from OUT to IN if space available', async () => {
        mockRunTransaction.mockImplementation(async (db, transactionFn) => {
            const mockTransaction = {
                get: jest.fn().mockImplementation((ref) => {
                    if (ref.path === 'matches/match1') {
                        return Promise.resolve({
                            exists: () => true,
                            data: () => ({ maxPlayers: 14, playerCount: 13 }) // Space available
                        });
                    }
                    if (ref.path.includes('user1')) {
                        return Promise.resolve({
                            exists: () => true,
                            data: () => ({ status: 'OUT' }) // Was OUT
                        });
                    }
                    return Promise.resolve({ exists: () => false });
                }),
                update: jest.fn(),
                set: jest.fn(),
            };
            await transactionFn(mockTransaction);
        });

        mockDoc.mockImplementation((db, col, id) => ({ path: `${col}/${id}` }));
        await expect(joinMatch('match1', 'user1', 'User 1', 'IN')).resolves.not.toThrow();
    });
});
