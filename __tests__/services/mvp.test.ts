import { doc, updateDoc } from 'firebase/firestore';
import { selectMvpCandidates, updateMvpCandidates } from '../../services/mvp';
import { MatchAction, MatchPosition } from '../../services/mvpLogic';

// Mock Firestore
jest.mock('firebase/firestore', () => ({
    getFirestore: jest.fn(),
    doc: jest.fn(),
    collection: jest.fn(),
    updateDoc: jest.fn(),
    writeBatch: jest.fn(() => ({ commit: jest.fn(), set: jest.fn() })),
    serverTimestamp: () => 'mock-timestamp',
}));

jest.mock('../../firebaseConfig', () => ({
    db: {},
}));

describe('MVP Services', () => {
    // Helper to create a player
    const createPlayer = (id: string, name: string, team: 'A' | 'B', scoreBase: number) => ({
        userId: id,
        displayName: name,
        team,
        position: 'FW' as MatchPosition,
        actions: {
            goals: scoreBase, // FW goal = 10 points
            assists: 0,
            cleanSheet: false,
            saves: 0,
            penaltySaves: 0,
            ownGoals: 0,
            cards: 0,
            teamWon: true
        } as MatchAction
    });

    describe('selectMvpCandidates', () => {
        test('Selects top 5 candidates by score (4 + 1 default joker)', () => {
            const players = [
                createPlayer('1', 'P1', 'A', 5), // 50 pts
                createPlayer('2', 'P2', 'A', 4), // 40 pts
                createPlayer('3', 'P3', 'A', 3), // 30 pts
                createPlayer('4', 'P4', 'B', 2), // 20 pts
                createPlayer('5', 'P5', 'B', 1), // 10 pts
                createPlayer('6', 'P6', 'B', 0), // 0 pts
            ];

            const candidates = selectMvpCandidates(players, 'A');

            expect(candidates.length).toBe(5);
            expect(candidates[0].odaylarId).toBe('1');
            expect(candidates[4].isJoker).toBe(true);
            expect(candidates[4].odaylarId).toBe('5'); // 5th best score is default joker
        });

        test('Ensures losing team is represented in top 4', () => {
            // Team A wins. Top 4 are all Team A.
            const players = [
                createPlayer('1', 'P1', 'A', 10),
                createPlayer('2', 'P2', 'A', 9),
                createPlayer('3', 'P3', 'A', 8),
                createPlayer('4', 'P4', 'A', 7),
                createPlayer('5', 'P5', 'B', 6), // Best of losing team B
            ];

            const candidates = selectMvpCandidates(players, 'A');

            // Expect top 3 to be A, 4th to be replaced by B
            expect(candidates[0].team).toBe('A');
            expect(candidates[1].team).toBe('A');
            expect(candidates[2].team).toBe('A');
            expect(candidates[3].team).toBe('B');
            expect(candidates[3].odaylarId).toBe('5');
        });

        test('Respects Admin Joker pick', () => {
            const players = [
                createPlayer('1', 'P1', 'A', 5),
                createPlayer('2', 'P2', 'A', 4),
                createPlayer('3', 'P3', 'A', 3),
                createPlayer('4', 'P4', 'A', 2),
                createPlayer('5', 'P5', 'B', 1),
                createPlayer('6', 'P6', 'B', 0), // Worst player
            ];

            // Admin picks player 6 as Joker explicitly
            const candidates = selectMvpCandidates(players, 'A', '6');

            expect(candidates.find(c => c.odaylarId === '6')?.isJoker).toBe(true);
        });
    });

    describe('updateMvpCandidates', () => {
        test('Calls Firestore updateDoc with new candidates', async () => {
            // Mock doc ref return
            (doc as jest.Mock).mockReturnValue('mock-doc-ref');
            (updateDoc as jest.Mock).mockResolvedValue(true);

            const mockCandidates: any[] = [{ id: '1' }, { id: '2' }];
            await updateMvpCandidates('match_123', mockCandidates);

            expect(doc).toHaveBeenCalledWith(expect.anything(), 'mvp_sessions', 'match_123');
            expect(updateDoc).toHaveBeenCalledWith('mock-doc-ref', { candidates: mockCandidates });
        });
    });
});
