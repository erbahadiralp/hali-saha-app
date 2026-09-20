import { createDispute, fileDisputeObjection, getPlayerDisputeCount } from '../../services/disputeService';
import { saveNotification } from '../../services/firestore';
import { addDoc, getDoc, getDocs, updateDoc } from 'firebase/firestore';

// Mock Firestore
jest.mock('firebase/firestore', () => ({
    getFirestore: jest.fn(),
    doc: jest.fn((db, col, id) => ({ path: `${col}/${id}` })),
    collection: jest.fn((db, name) => ({ path: name })),
    getDoc: jest.fn(),
    getDocs: jest.fn(),
    addDoc: jest.fn(),
    updateDoc: jest.fn(),
    query: jest.fn(),
    where: jest.fn(),
    serverTimestamp: () => 'mock-timestamp',
}));

jest.mock('../../firebaseConfig', () => ({
    db: {},
}));

jest.mock('../../services/firestore', () => ({
    saveNotification: jest.fn(),
}));

describe('Dispute Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('createDispute', () => {
        test('creates dispute document and sends notification', async () => {
            (addDoc as jest.Mock).mockResolvedValue({ id: 'dispute123' });
            (saveNotification as jest.Mock).mockResolvedValue('notif123');

            const id = await createDispute('match1', 'player1', 'admin1', 'goals', 1, 2);

            expect(id).toBe('dispute123');
            expect(addDoc).toHaveBeenCalled();
            expect(saveNotification).toHaveBeenCalledWith(expect.objectContaining({
                userId: 'player1',
                title: 'İstatistikleriniz Değiştirildi',
                type: 'general',
                senderId: 'admin1',
            }));
        });
    });

    describe('fileDisputeObjection', () => {
        test('allows filing objection if quota is not exceeded', async () => {
            // Mock getDocs to return less than 3 disputes
            (getDocs as jest.Mock).mockResolvedValue({
                docs: [
                    {
                        id: 'd1',
                        data: () => ({
                            createdAt: { toDate: () => new Date() }, // current year
                        }),
                    },
                ],
            });

            // Mock getDoc for the dispute to object to
            (getDoc as jest.Mock).mockResolvedValue({
                exists: () => true,
                data: () => ({
                    playerId: 'player1',
                    deadline: { toDate: () => new Date(Date.now() + 100000) },
                }),
            });

            await expect(fileDisputeObjection('dispute123', 'player1', 'It was actually 2 goals'))
                .resolves.not.toThrow();

            expect(updateDoc).toHaveBeenCalled();
        });

        test('blocks filing objection if player exceeded quota (>= 3 disputes in current season)', async () => {
            const currentYear = new Date().getFullYear();
            (getDocs as jest.Mock).mockResolvedValue({
                docs: [
                    { id: 'd1', data: () => ({ createdAt: new Date(currentYear, 1, 1) }) },
                    { id: 'd2', data: () => ({ createdAt: new Date(currentYear, 2, 1) }) },
                    { id: 'd3', data: () => ({ createdAt: new Date(currentYear, 3, 1) }) },
                ],
            });

            await expect(fileDisputeObjection('dispute123', 'player1', 'Objection'))
                .rejects.toThrow('Sezon başına maksimum itiraz sınırına (3) ulaştınız.');

            expect(updateDoc).not.toHaveBeenCalled();
        });
    });
});
