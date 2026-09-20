import { httpsCallable } from 'firebase/functions';
import { functions } from '../firebaseConfig';
import { invalidateUserProfile } from './userService';

/**
 * Profile counters are rebuilt server-side (see functions `recomputeUserStats`). Profiles written before
 * that change may hold double-counted totals, so each user migrates once by asking the server to rebuild.
 */
export const CURRENT_STATS_VERSION = 2;

let migrating: Promise<boolean> | null = null;
// One attempt per user per app session, so a missing/undeployed function doesn't retry on every screen focus.
const attempted = new Set<string>();

/** Rebuilds the signed-in user's stats if their profile predates the server-owned counters. Returns true when it ran. */
export function ensureStatsMigrated(profile: { uid?: string; statsVersion?: number } | null): Promise<boolean> {
    if (!profile?.uid || (profile.statsVersion ?? 0) >= CURRENT_STATS_VERSION) return Promise.resolve(false);
    if (migrating) return migrating;
    if (attempted.has(profile.uid)) return Promise.resolve(false);
    attempted.add(profile.uid);
    migrating = httpsCallable(functions, 'recomputeMyStats')()
        .then(() => {
            invalidateUserProfile(profile.uid);
            return true;
        })
        .catch(error => {
            // Not fatal: the next finished match rebuilds the counters anyway.
            console.warn('Stats migration failed:', error);
            return false;
        })
        .finally(() => {
            migrating = null;
        });
    return migrating;
}
