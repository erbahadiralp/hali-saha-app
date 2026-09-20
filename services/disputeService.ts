import { addDoc, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { saveNotification } from './firestore';

/**
 * DISPUTE_SYSTEM: Create a dispute when admin changes a player's stats
 * Player gets 24hr window to contest the change
 */

export interface Dispute {
    id?: string;
    matchId: string;
    playerId: string;
    adminId: string;
    field: string; // e.g. 'goals', 'assists'
    oldValue: number;
    newValue: number;
    status: 'open' | 'resolved' | 'expired' | 'auto-resolved';
    resolution?: 'admin-accepted' | 'player-accepted' | 'auto-original';
    createdAt: any;
    resolvedAt?: any;
    playerMessage?: string;
    adminResponse?: string;
    deadline: any; // 24hrs from creation — player dispute window
    adminDeadline: any; // 48hrs from creation — admin response window
}

/**
 * Create a dispute when admin modifies player stats
 */
export async function createDispute(
    matchId: string,
    playerId: string,
    adminId: string,
    field: string,
    oldValue: number,
    newValue: number
): Promise<string> {
    try {
        const disputeRef = await addDoc(collection(db, 'disputes'), {
            matchId,
            playerId,
            adminId,
            field,
            oldValue,
            newValue,
            status: 'open',
            createdAt: serverTimestamp(),
            // Deadline: 24hrs from creation
            deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
            // Admin response deadline: 48hrs from dispute creation
            adminDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
        });

        // Send notification to player
        try {
            await saveNotification({
                userId: playerId,
                title: 'İstatistikleriniz Değiştirildi',
                body: `Admin bir maçtaki '${field}' istatistiğinizi ${oldValue} -> ${newValue} olarak güncelledi. 24 saat içinde itiraz edebilirsiniz.`,
                type: 'general',
                senderId: adminId,
                read: false,
            });
        } catch (notifErr) {
            console.error('Failed to send dispute notification:', notifErr);
        }

        return disputeRef.id;
    } catch (error) {
        console.error('Error creating dispute:', error);
        throw error;
    }
}

/**
 * Player files an objection to an admin stat change
 */
export async function fileDisputeObjection(
    disputeId: string,
    playerId: string,
    message: string
): Promise<void> {
    try {
        const disputeRef = doc(db, 'disputes', disputeId);
        const disputeDoc = await getDoc(disputeRef);

        if (!disputeDoc.exists()) throw new Error('İtiraz bulunamadı');

        const dispute = disputeDoc.data() as Dispute;

        // Verify player owns this dispute
        if (dispute.playerId !== playerId) {
            throw new Error('Bu itirazı sadece ilgili oyuncu yapabilir.');
        }

        // Check if dispute window is still open
        const deadline = dispute.deadline?.toDate ? dispute.deadline.toDate() : new Date(dispute.deadline);
        if (new Date() > deadline) {
            throw new Error('İtiraz süresi dolmuş.');
        }

        // Check quota (max 3 disputes per season)
        const count = await getPlayerDisputeCount(playerId);
        if (count >= 3) {
            throw new Error('Sezon başına maksimum itiraz sınırına (3) ulaştınız.');
        }

        await updateDoc(disputeRef, {
            playerMessage: message,
            status: 'open',
            objectedAt: serverTimestamp()
        });
    } catch (error) {
        console.error('Error filing dispute objection:', error);
        throw error;
    }
}

/**
 * Admin resolves a dispute
 */
export async function resolveDispute(
    disputeId: string,
    adminId: string,
    resolution: 'admin-accepted' | 'player-accepted',
    response?: string
): Promise<void> {
    try {
        const disputeRef = doc(db, 'disputes', disputeId);
        const disputeDoc = await getDoc(disputeRef);

        if (!disputeDoc.exists()) throw new Error('İtiraz bulunamadı');

        const dispute = disputeDoc.data() as Dispute;

        if (dispute.adminId !== adminId) {
            throw new Error('Bu itirazı sadece ilgili admin çözebilir.');
        }

        await updateDoc(disputeRef, {
            status: 'resolved',
            resolution,
            adminResponse: response || '',
            resolvedAt: serverTimestamp()
        });

        // If player-accepted, revert the stat change
        if (resolution === 'player-accepted') {
            const participantRef = doc(db, 'match_participants', `${dispute.matchId}_${dispute.playerId}`);
            await updateDoc(participantRef, {
                [dispute.field]: dispute.oldValue,
                disputeReverted: true
            });
        }
    } catch (error) {
        console.error('Error resolving dispute:', error);
        throw error;
    }
}

/**
 * Auto-resolve expired disputes (admin didn't respond within 48hrs)
 * Original value is restored
 */
export async function autoResolveExpiredDisputes(): Promise<number> {
    try {
        const q = query(
            collection(db, 'disputes'),
            where('status', '==', 'open')
        );
        const snapshot = await getDocs(q);

        let resolved = 0;
        const now = new Date();

        for (const disputeDoc of snapshot.docs) {
            const dispute = disputeDoc.data() as Dispute;
            const adminDeadline = dispute.adminDeadline?.toDate
                ? dispute.adminDeadline.toDate()
                : new Date(dispute.adminDeadline);

            if (now > adminDeadline) {
                // Auto-resolve: original value wins
                await updateDoc(doc(db, 'disputes', disputeDoc.id), {
                    status: 'auto-resolved',
                    resolution: 'auto-original',
                    resolvedAt: serverTimestamp()
                });

                // Revert to original value
                const participantRef = doc(db, 'match_participants', `${dispute.matchId}_${dispute.playerId}`);
                await updateDoc(participantRef, {
                    [dispute.field]: dispute.oldValue,
                    disputeAutoReverted: true
                });

                resolved++;
            }
        }

        return resolved;
    } catch (error) {
        console.error('Error auto-resolving disputes:', error);
        throw error;
    }
}

/**
 * Get disputes for a player
 */
export async function getPlayerDisputes(userId: string): Promise<Dispute[]> {
    try {
        const q = query(
            collection(db, 'disputes'),
            where('playerId', '==', userId)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Dispute));
    } catch (error) {
        console.error('Error getting player disputes:', error);
        return [];
    }
}

/**
 * Get dispute count for a player in current season
 * Used to warn players who file too many disputes (>3 per season)
 */
export async function getPlayerDisputeCount(userId: string): Promise<number> {
    try {
        const disputes = await getPlayerDisputes(userId);
        // Filter to current year
        const currentYear = new Date().getFullYear();
        return disputes.filter(d => {
            const created = d.createdAt?.toDate ? d.createdAt.toDate() : new Date(d.createdAt);
            return created.getFullYear() === currentYear;
        }).length;
    } catch (error) {
        console.error('Error getting dispute count:', error);
        return 0;
    }
}

/**
 * Get all disputes for a specific match (for admin to review)
 */
export async function getMatchDisputes(matchId: string, adminId: string): Promise<Dispute[]> {
    try {
        const q = query(
            collection(db, 'disputes'),
            where('matchId', '==', matchId),
            where('adminId', '==', adminId)
        );
        const snapshot = await getDocs(q);
        return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Dispute));
    } catch (error) {
        console.error('Error getting match disputes:', error);
        return [];
    }
}
