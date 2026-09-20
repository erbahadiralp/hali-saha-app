import { addDoc, collection, deleteDoc, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * Report Service - UGC Compliance
 * Handles user blocking and content reporting for App Store requirements
 */

// ════════════════════════ BLOCK USER ════════════════════════

/**
 * Block a user. Blocked users won't appear in feeds or be able to interact.
 */
export async function blockUser(userId: string, blockedUserId: string): Promise<void> {
    const ref = doc(db, `users/${userId}/blockedUsers`, blockedUserId);
    await setDoc(ref, {
        blockedUserId,
        blockedAt: serverTimestamp(),
    });
}

/**
 * Unblock a user
 */
export async function unblockUser(userId: string, blockedUserId: string): Promise<void> {
    const ref = doc(db, `users/${userId}/blockedUsers`, blockedUserId);
    await deleteDoc(ref);
}

/**
 * Get list of blocked user IDs
 */
export async function getBlockedUsers(userId: string): Promise<string[]> {
    const q = query(collection(db, `users/${userId}/blockedUsers`));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => d.data().blockedUserId);
}

/**
 * Check if a specific user is blocked
 */
export async function isUserBlocked(userId: string, targetUserId: string): Promise<boolean> {
    const blocked = await getBlockedUsers(userId);
    return blocked.includes(targetUserId);
}

// ════════════════════════ REPORT CONTENT ════════════════════════

export type ReportReason =
    | 'inappropriate_name'
    | 'inappropriate_photo'
    | 'harassment'
    | 'spam'
    | 'other';

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
    { value: 'inappropriate_name', label: 'Uygunsuz İsim / Kullanıcı Adı' },
    { value: 'inappropriate_photo', label: 'Uygunsuz Profil Fotoğrafı' },
    { value: 'harassment', label: 'Taciz / Zorbalık' },
    { value: 'spam', label: 'Spam / İstenmeyen İçerik' },
    { value: 'other', label: 'Diğer' },
];

/**
 * Report a user for inappropriate content
 */
export async function reportUser(
    reporterId: string,
    targetUserId: string,
    reason: ReportReason,
    details?: string
): Promise<void> {
    await addDoc(collection(db, 'reports'), {
        reporterId,
        targetUserId,
        reason,
        details: details || '',
        status: 'pending', // pending | reviewed | dismissed
        createdAt: serverTimestamp(),
    });
}

/**
 * Report a group for inappropriate content
 */
export async function reportGroup(
    reporterId: string,
    groupId: string,
    reason: ReportReason,
    details?: string
): Promise<void> {
    await addDoc(collection(db, 'reports'), {
        reporterId,
        targetGroupId: groupId,
        reason,
        details: details || '',
        status: 'pending',
        createdAt: serverTimestamp(),
    });
}

/**
 * Check if user has already reported a target
 */
export async function hasAlreadyReported(reporterId: string, targetUserId: string): Promise<boolean> {
    const q = query(
        collection(db, 'reports'),
        where('reporterId', '==', reporterId),
        where('targetUserId', '==', targetUserId)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
}
