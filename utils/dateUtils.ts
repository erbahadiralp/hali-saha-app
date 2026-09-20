/**
 * Centralized date normalization utility.
 * Handles Firestore Timestamps, Date objects, strings, and numbers.
 */

export function normalizeDate(value: any): Date {
    if (!value) return new Date(0);

    // Already a Date
    if (value instanceof Date) return value;

    // Firestore Timestamp (has .toDate())
    if (typeof value?.toDate === 'function') return value.toDate();

    // Firestore Timestamp (has .seconds)
    if (typeof value?.seconds === 'number') {
        return new Date(value.seconds * 1000 + (value.nanoseconds || 0) / 1000000);
    }

    // Number (epoch ms)
    if (typeof value === 'number') return new Date(value);

    // String
    if (typeof value === 'string') {
        const parsed = new Date(value);
        return isNaN(parsed.getTime()) ? new Date(0) : parsed;
    }

    return new Date(0);
}

/**
 * Check if a date is in the future
 */
export function isFutureDate(value: any): boolean {
    const date = normalizeDate(value);
    return date > new Date();
}

/**
 * Check if a date is in the past
 */
export function isPastDate(value: any): boolean {
    const date = normalizeDate(value);
    return date < new Date();
}

/**
 * Calculate difference in days between two dates (using UTC to avoid timezone issues)
 */
export function diffInDaysUTC(date1: any, date2: any): number {
    const d1 = normalizeDate(date1);
    const d2 = normalizeDate(date2);
    const utc1 = Date.UTC(d1.getFullYear(), d1.getMonth(), d1.getDate());
    const utc2 = Date.UTC(d2.getFullYear(), d2.getMonth(), d2.getDate());
    return Math.floor((utc2 - utc1) / (1000 * 60 * 60 * 24));
}

/**
 * Generate a UUID v4 (for guest players, etc.)
 */
export function generateUUID(): string {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });
}
