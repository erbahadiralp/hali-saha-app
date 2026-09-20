import { addDoc, collection, doc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '../firebaseConfig';

/**
 * VACATION_MODE: Freeze activity score for players on vacation/injury
 * - Max 2 per calendar year
 * - Max 30 days per vacation
 * - Min 7 days before deactivation
 * - Auto-expires after 30 days
 */

export interface VacationRecord {
    id?: string;
    userId: string;
    type: 'vacation' | 'injury';
    startedAt: any;
    endsAt: any; // Max 30 days from start
    deactivatedAt?: any;
    isActive: boolean;
    minDeactivationDate: any; // 7 days from start
}

/**
 * Check vacation status for a user
 */
export async function getVacationStatus(userId: string): Promise<{
    isOnVacation: boolean;
    currentVacation?: VacationRecord;
    vacationsThisYear: number;
    canActivate: boolean;
    history: VacationRecord[];
}> {
    try {
        const q = query(
            collection(db, 'vacation_mode'),
            where('userId', '==', userId)
        );
        const snapshot = await getDocs(q);
        const records = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as VacationRecord));

        // Find active vacation
        const activeVacation = records.find(r => r.isActive);

        // Count vacations this year
        const currentYear = new Date().getFullYear();
        const vacationsThisYear = records.filter(r => {
            const started = r.startedAt?.toDate ? r.startedAt.toDate() : new Date(r.startedAt);
            return started.getFullYear() === currentYear;
        }).length;

        // Check if auto-expired
        if (activeVacation) {
            const endsAt = activeVacation.endsAt?.toDate
                ? activeVacation.endsAt.toDate()
                : new Date(activeVacation.endsAt);

            if (new Date() > endsAt) {
                // Auto-expire
                await updateDoc(doc(db, 'vacation_mode', activeVacation.id!), {
                    isActive: false,
                    deactivatedAt: serverTimestamp(),
                    autoExpired: true
                });
                return {
                    isOnVacation: false,
                    vacationsThisYear,
                    canActivate: vacationsThisYear < 2,
                    history: records
                };
            }
        }

        return {
            isOnVacation: !!activeVacation,
            currentVacation: activeVacation,
            vacationsThisYear,
            canActivate: !activeVacation && vacationsThisYear < 2,
            history: records
        };
    } catch (error) {
        console.error('Error getting vacation status:', error);
        return { isOnVacation: false, vacationsThisYear: 0, canActivate: false, history: [] };
    }
}

/**
 * Activate vacation mode
 */
export const VACATION_MIN_DAYS = 7;
export const VACATION_MAX_DAYS = 30;
export const VACATIONS_PER_YEAR = 2;

export async function activateVacation(
    userId: string,
    type: 'vacation' | 'injury' = 'vacation',
    durationDays: number = VACATION_MAX_DAYS
): Promise<{ success: boolean; error?: string }> {
    try {
        const status = await getVacationStatus(userId);

        if (status.isOnVacation) {
            return { success: false, error: 'Zaten izin/sakatlık modundasınız.' };
        }

        if (!status.canActivate) {
            return { success: false, error: 'Bu yıl için izin hakkınız dolmuş (max 2/yıl).' };
        }

        const days = Math.round(Math.min(VACATION_MAX_DAYS, Math.max(VACATION_MIN_DAYS, durationDays)));
        const dayMs = 24 * 60 * 60 * 1000;
        const now = new Date();
        const endsAt = new Date(now.getTime() + days * dayMs);
        const minDeactivationDate = new Date(now.getTime() + VACATION_MIN_DAYS * dayMs);

        await addDoc(collection(db, 'vacation_mode'), {
            userId,
            type,
            startedAt: serverTimestamp(),
            endsAt,
            isActive: true,
            minDeactivationDate,
        });

        return { success: true };
    } catch (error) {
        console.error('Error activating vacation:', error);
        return { success: false, error: 'Bir hata oluştu.' };
    }
}

/**
 * Deactivate vacation mode
 */
export async function deactivateVacation(
    userId: string
): Promise<{ success: boolean; error?: string }> {
    try {
        const status = await getVacationStatus(userId);

        if (!status.isOnVacation || !status.currentVacation) {
            return { success: false, error: 'Aktif bir izin/sakatlık modunuz yok.' };
        }

        const minDate = status.currentVacation.minDeactivationDate?.toDate
            ? status.currentVacation.minDeactivationDate.toDate()
            : new Date(status.currentVacation.minDeactivationDate);

        if (new Date() < minDate) {
            const daysRemaining = Math.ceil((minDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
            return {
                success: false,
                error: `İzin modu en az 7 gün aktif kalmalıdır. ${daysRemaining} gün sonra kapatabilirsiniz.`
            };
        }

        await updateDoc(doc(db, 'vacation_mode', status.currentVacation.id!), {
            isActive: false,
            deactivatedAt: serverTimestamp()
        });

        return { success: true };
    } catch (error) {
        console.error('Error deactivating vacation:', error);
        return { success: false, error: 'Bir hata oluştu.' };
    }
}

/**
 * Check if vacation is active (for use in activity score calculation)
 */
export async function isVacationActive(userId: string): Promise<boolean> {
    const status = await getVacationStatus(userId);
    return status.isOnVacation;
}
