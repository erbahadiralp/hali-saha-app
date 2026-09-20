/**
 * Account deletion with a 30-day grace period.
 *
 * The client only confirms the user's intent and calls `requestAccountDeletion`; the Cloud Function
 * flags the profile, frees the user's upcoming match spots and, after 30 days, removes the account
 * and anonymizes shared data. Signing in again within the grace period offers `restoreDeletedAccount`.
 */

import { EmailAuthProvider, User, reauthenticateWithCredential } from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from '../firebaseConfig';
import { invalidateUserProfile } from './userService';

export const ACCOUNT_GRACE_DAYS = 30;
/** Typed confirmation for accounts without a password (Google, Apple). */
export const DELETE_CONFIRM_WORD = 'SİL';

interface DeleteAccountResult {
    success: boolean;
    error?: string;
}

export function accountUsesPassword(user: User | null | undefined): boolean {
    return !!user?.providerData.some(p => p.providerId === 'password');
}

export async function deleteUserAccount({ password, confirmation, reason }: {
    password?: string;
    confirmation?: string;
    reason?: string;
}): Promise<DeleteAccountResult> {
    const currentUser = auth.currentUser;
    if (!currentUser) {
        return { success: false, error: 'Kullanıcı oturumu bulunamadı' };
    }

    try {
        if (accountUsesPassword(currentUser)) {
            if (!password || !currentUser.email) return { success: false, error: 'Lütfen şifreni gir.' };
            // Proves the person holding the device knows the password before anything is scheduled.
            await reauthenticateWithCredential(currentUser, EmailAuthProvider.credential(currentUser.email, password));
        } else if (confirmation?.trim().toLocaleUpperCase('tr-TR') !== DELETE_CONFIRM_WORD) {
            return { success: false, error: `Onaylamak için ${DELETE_CONFIRM_WORD} yaz.` };
        }

        await httpsCallable(functions, 'requestAccountDeletion')({ reason: reason?.trim() || null });
        invalidateUserProfile(currentUser.uid);
        return { success: true };
    } catch (error: any) {
        console.error('Account deletion error:', error);

        if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
            return { success: false, error: 'Şifre hatalı. Lütfen şifreni kontrol et.' };
        }
        if (error.code === 'auth/too-many-requests') {
            return { success: false, error: 'Çok fazla deneme yaptın. Lütfen biraz bekle.' };
        }
        return { success: false, error: 'Hesap silinirken bir hata oluştu' };
    }
}

/** Cancels a pending deletion for the signed-in user. */
export async function restoreDeletedAccount(): Promise<void> {
    const uid = auth.currentUser?.uid;
    await httpsCallable(functions, 'restoreAccount')();
    if (uid) invalidateUserProfile(uid);
}
