import { normalizeDate, isFutureDate, isPastDate, diffInDaysUTC, generateUUID } from '../../utils/dateUtils';

describe('normalizeDate', () => {
    test('returns epoch for null/undefined/falsy', () => {
        expect(normalizeDate(null).getTime()).toBe(0);
        expect(normalizeDate(undefined).getTime()).toBe(0);
        expect(normalizeDate(0).getTime()).toBe(0);
        expect(normalizeDate('').getTime()).toBe(0);
    });

    test('returns same Date if already a Date', () => {
        const date = new Date('2025-06-15');
        expect(normalizeDate(date)).toBe(date);
    });

    test('handles Firestore Timestamp with toDate()', () => {
        const mockTimestamp = {
            toDate: () => new Date('2025-06-15T10:00:00Z'),
        };
        expect(normalizeDate(mockTimestamp).toISOString()).toBe('2025-06-15T10:00:00.000Z');
    });

    test('handles Firestore Timestamp with seconds/nanoseconds', () => {
        const mockTimestamp = {
            seconds: 1718448000, // 2024-06-15T12:00:00Z
            nanoseconds: 500000000,
        };
        const result = normalizeDate(mockTimestamp);
        expect(result).toBeInstanceOf(Date);
        expect(result.getTime()).toBeGreaterThan(0);
    });

    test('handles epoch milliseconds (number)', () => {
        const epoch = new Date('2025-01-01').getTime();
        expect(normalizeDate(epoch).getTime()).toBe(epoch);
    });

    test('handles date string', () => {
        const result = normalizeDate('2025-06-15T10:00:00Z');
        expect(result.toISOString()).toBe('2025-06-15T10:00:00.000Z');
    });

    test('handles invalid date string gracefully', () => {
        const result = normalizeDate('not-a-date');
        expect(result.getTime()).toBe(0);
    });

    test('handles unknown object type gracefully', () => {
        const result = normalizeDate({ foo: 'bar' });
        expect(result.getTime()).toBe(0);
    });
});

describe('isFutureDate', () => {
    test('returns true for future date', () => {
        const future = new Date(Date.now() + 86400000); // tomorrow
        expect(isFutureDate(future)).toBe(true);
    });

    test('returns false for past date', () => {
        const past = new Date(Date.now() - 86400000);
        expect(isFutureDate(past)).toBe(false);
    });

    test('handles string dates', () => {
        expect(isFutureDate('2099-12-31')).toBe(true);
        expect(isFutureDate('2000-01-01')).toBe(false);
    });
});

describe('isPastDate', () => {
    test('returns true for past date', () => {
        const past = new Date(Date.now() - 86400000);
        expect(isPastDate(past)).toBe(true);
    });

    test('returns false for future date', () => {
        const future = new Date(Date.now() + 86400000);
        expect(isPastDate(future)).toBe(false);
    });
});

describe('diffInDaysUTC', () => {
    test('returns 0 for same date', () => {
        const date = new Date('2025-06-15');
        expect(diffInDaysUTC(date, date)).toBe(0);
    });

    test('returns positive for later date2', () => {
        const d1 = new Date('2025-06-15');
        const d2 = new Date('2025-06-20');
        expect(diffInDaysUTC(d1, d2)).toBe(5);
    });

    test('returns negative for earlier date2', () => {
        const d1 = new Date('2025-06-20');
        const d2 = new Date('2025-06-15');
        expect(diffInDaysUTC(d1, d2)).toBe(-5);
    });

    test('handles cross-month boundaries', () => {
        const d1 = new Date('2025-01-30');
        const d2 = new Date('2025-02-02');
        expect(diffInDaysUTC(d1, d2)).toBe(3);
    });

    test('handles leap year', () => {
        const d1 = new Date('2024-02-28');
        const d2 = new Date('2024-03-01');
        expect(diffInDaysUTC(d1, d2)).toBe(2); // Feb 29 exists in 2024
    });

    test('handles string inputs', () => {
        expect(diffInDaysUTC('2025-06-15', '2025-06-25')).toBe(10);
    });
});

describe('generateUUID', () => {
    test('returns a string', () => {
        expect(typeof generateUUID()).toBe('string');
    });

    test('has correct UUID v4 format', () => {
        const uuid = generateUUID();
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
        expect(uuid).toMatch(uuidRegex);
    });

    test('generates unique values', () => {
        const uuids = new Set<string>();
        for (let i = 0; i < 100; i++) {
            uuids.add(generateUUID());
        }
        expect(uuids.size).toBe(100);
    });
});
