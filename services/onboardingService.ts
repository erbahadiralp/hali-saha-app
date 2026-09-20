import type { User } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, query, runTransaction, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { invalidateUserProfile } from './userService';

/**
 * Onboarding is provider-agnostic: e-posta, Google and Apple sign-ups all end up here. Any signed-in
 * user whose profile is missing or has no chosen username is sent through the same flow.
 */

export const USERNAME_PATTERN = /^[a-z0-9_]{3,20}$/;

export type Position = 'GK' | 'DEF' | 'MID' | 'FWD';
export type PreferredFoot = 'right' | 'left' | 'both';

/** Creates users/{uid} for accounts that don't have one yet (social sign-in never wrote it). */
export async function ensureUserProfile(user: User, extras: { name?: string } = {}) {
    const ref = doc(db, 'users', user.uid);
    const snap = await getDoc(ref);
    if (snap.exists()) return { uid: user.uid, ...snap.data() } as any;

    const name = extras.name || user.displayName || user.email?.split('@')[0] || 'Oyuncu';
    const profile = {
        name,
        displayName: name,
        email: user.email?.toLowerCase() ?? '',
        photoURL: user.photoURL ?? null,
        authProvider: user.providerData[0]?.providerId ?? 'password',
        hasSeenOnboarding: false,
        needsUsername: true,
        createdAt: serverTimestamp(),
        preferences: { notifications: true, theme: 'system' },
    };
    // merge: e-posta kaydı aynı anda kendi alanlarını yazabilir; hiçbiri diğerini silmez.
    await setDoc(ref, profile, { merge: true });
    invalidateUserProfile(user.uid);
    return { uid: user.uid, ...profile };
}

export function needsOnboarding(profile: any): boolean {
    if (!profile) return true;
    return profile.hasSeenOnboarding === false || profile.needsUsername === true || !profile.username;
}

/** True when nobody but `uid` holds the username (reservation doc or an existing profile). */
export async function isUsernameFree(username: string, uid: string): Promise<boolean> {
    const reservation = await getDoc(doc(db, 'usernames', username));
    if (reservation.exists() && reservation.data().uid !== uid) return false;
    const holders = await getDocs(query(collection(db, 'users'), where('username', '==', username), limit(2)));
    return holders.docs.every(d => d.id === uid);
}

export const USERNAME_TAKEN_MESSAGE = 'Bu kullanıcı adı alınmış.';

/**
 * Atomically claims `usernames/{username}` and writes it to the profile together with `fields`.
 *
 * Uniqueness when two people pick the same name at the same moment:
 * - the reservation doc is read inside the transaction; Firestore re-runs a transaction whose read
 *   changed before commit, so the second attempt sees the first reservation and fails;
 * - the security rules only let a user create a reservation for their own uid and only accept a
 *   profile username whose reservation (after the write) belongs to them, so the check can't be bypassed.
 */
export async function claimUsername(user: User, rawUsername: string, fields: Record<string, unknown> = {}) {
    const username = rawUsername.trim().toLowerCase();
    if (!USERNAME_PATTERN.test(username)) throw new Error('Kullanıcı adı 3-20 karakter olmalı; harf, rakam ve _ kullanılabilir.');
    // Legacy profiles may hold a name without a reservation doc; catch those before the transaction.
    if (!(await isUsernameFree(username, user.uid))) throw new Error(USERNAME_TAKEN_MESSAGE);

    const userRef = doc(db, 'users', user.uid);
    const reservationRef = doc(db, 'usernames', username);

    await runTransaction(db, async tx => {
        const [userSnap, reservation] = await Promise.all([tx.get(userRef), tx.get(reservationRef)]);
        if (reservation.exists() && reservation.data().uid !== user.uid) throw new Error(USERNAME_TAKEN_MESSAGE);

        // Release the previously held name (e.g. an auto-generated one or the old name on rename).
        const previous = userSnap.exists() ? userSnap.data().username : null;
        let previousRef = null;
        if (previous && previous !== username) {
            const ref = doc(db, 'usernames', previous);
            const previousSnap = await tx.get(ref);
            if (previousSnap.exists() && previousSnap.data().uid === user.uid) previousRef = ref;
        }

        if (!reservation.exists()) {
            tx.set(reservationRef, { uid: user.uid, email: user.email?.toLowerCase() ?? '', createdAt: serverTimestamp() });
        }
        if (previousRef) tx.delete(previousRef);
        tx.set(userRef, {
            username,
            ...(previous && previous !== username ? { lastUsernameChange: serverTimestamp() } : {}),
            ...fields,
        }, { merge: true });
    });
    invalidateUserProfile(user.uid);
    return username;
}

export async function completeOnboarding(
    user: User,
    data: { username: string; position?: Position | null; preferredFoot?: PreferredFoot | null; photoURL?: string | null }
) {
    await claimUsername(user, data.username, {
        ...(data.position ? { position: data.position } : {}),
        ...(data.preferredFoot ? { preferredFoot: data.preferredFoot } : {}),
        ...(data.photoURL ? { photoURL: data.photoURL } : {}),
        hasSeenOnboarding: true,
        needsUsername: false,
        onboardingCompleted: true,
    });
}
