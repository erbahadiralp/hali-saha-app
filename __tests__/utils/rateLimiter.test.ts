import { checkRateLimit, resetRateLimit, formatRetryTime, RateLimitConfig } from '../../utils/rateLimiter';

describe('checkRateLimit', () => {
    const testConfig: RateLimitConfig = {
        maxAttempts: 3,
        windowMs: 60000,
        cooldownMs: 10000,
    };

    beforeEach(() => {
        // Reset all limits before each test
        resetRateLimit('test-key');
    });

    test('first attempt is always allowed', () => {
        const result = checkRateLimit('test-key', testConfig);
        expect(result.allowed).toBe(true);
        expect(result.remainingAttempts).toBe(2);
    });

    test('subsequent attempts within limit are allowed', () => {
        checkRateLimit('test-key', testConfig); // 1st
        const result = checkRateLimit('test-key', testConfig); // 2nd
        expect(result.allowed).toBe(true);
        expect(result.remainingAttempts).toBe(1);
    });

    test('exceeding max attempts blocks', () => {
        checkRateLimit('test-key', testConfig); // 1
        checkRateLimit('test-key', testConfig); // 2
        checkRateLimit('test-key', testConfig); // 3
        const result = checkRateLimit('test-key', testConfig); // 4 - blocked
        expect(result.allowed).toBe(false);
        expect(result.remainingAttempts).toBe(0);
        expect(result.retryAfterMs).toBeGreaterThan(0);
    });

    test('different keys are independent', () => {
        for (let i = 0; i < 5; i++) {
            checkRateLimit('key-a', testConfig);
        }
        const result = checkRateLimit('key-b', testConfig);
        expect(result.allowed).toBe(true);
        resetRateLimit('key-a');
        resetRateLimit('key-b');
    });

    test('resetRateLimit clears the limit', () => {
        for (let i = 0; i < 5; i++) {
            checkRateLimit('test-key', testConfig);
        }
        resetRateLimit('test-key');
        const result = checkRateLimit('test-key', testConfig);
        expect(result.allowed).toBe(true);
    });

    test('uses default config when none provided', () => {
        const result = checkRateLimit('default-test');
        expect(result.allowed).toBe(true);
        resetRateLimit('default-test');
    });
});

describe('formatRetryTime', () => {
    test('formats seconds correctly', () => {
        expect(formatRetryTime(5000)).toBe('5 saniye');
        expect(formatRetryTime(1000)).toBe('1 saniye');
        expect(formatRetryTime(30000)).toBe('30 saniye');
    });

    test('formats minutes correctly', () => {
        expect(formatRetryTime(60000)).toBe('1 dakika');
        expect(formatRetryTime(120000)).toBe('2 dakika');
        expect(formatRetryTime(90000)).toBe('2 dakika'); // Rounds up
    });

    test('formats sub-second as 1 saniye', () => {
        expect(formatRetryTime(500)).toBe('1 saniye');
    });
});
