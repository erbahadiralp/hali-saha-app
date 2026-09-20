/**
 * Client-side rate limiter utility.
 * Prevents rapid-fire API calls (login, register, invite, etc.)
 */

interface RateLimitEntry {
    count: number;
    firstAttempt: number;
    lastAttempt: number;
}

const limitStore: Map<string, RateLimitEntry> = new Map();

export interface RateLimitConfig {
    /** Maximum attempts allowed in the time window */
    maxAttempts: number;
    /** Time window in milliseconds */
    windowMs: number;
    /** Cooldown period in milliseconds after limit is reached */
    cooldownMs?: number;
}

// Default configs for common operations
export const RATE_LIMITS = {
    login: { maxAttempts: 5, windowMs: 60_000, cooldownMs: 60_000 } as RateLimitConfig,
    register: { maxAttempts: 3, windowMs: 60_000, cooldownMs: 120_000 } as RateLimitConfig,
    invite: { maxAttempts: 10, windowMs: 60_000, cooldownMs: 30_000 } as RateLimitConfig,
    search: { maxAttempts: 20, windowMs: 60_000 } as RateLimitConfig,
    joinMatch: { maxAttempts: 5, windowMs: 10_000, cooldownMs: 5_000 } as RateLimitConfig,
    default: { maxAttempts: 30, windowMs: 60_000 } as RateLimitConfig,
};

/**
 * Check if an action is rate limited.
 * @returns Object with `allowed` boolean and `retryAfterMs` (ms until next attempt)
 */
export function checkRateLimit(
    key: string,
    config: RateLimitConfig = RATE_LIMITS.default
): { allowed: boolean; retryAfterMs: number; remainingAttempts: number } {
    const now = Date.now();
    const entry = limitStore.get(key);

    if (!entry) {
        limitStore.set(key, { count: 1, firstAttempt: now, lastAttempt: now });
        return { allowed: true, retryAfterMs: 0, remainingAttempts: config.maxAttempts - 1 };
    }

    // Check if window has expired - reset
    if (now - entry.firstAttempt > config.windowMs) {
        limitStore.set(key, { count: 1, firstAttempt: now, lastAttempt: now });
        return { allowed: true, retryAfterMs: 0, remainingAttempts: config.maxAttempts - 1 };
    }

    // Check cooldown period
    if (entry.count >= config.maxAttempts) {
        const cooldown = config.cooldownMs || config.windowMs;
        const timeSinceLimit = now - entry.lastAttempt;
        if (timeSinceLimit < cooldown) {
            return {
                allowed: false,
                retryAfterMs: cooldown - timeSinceLimit,
                remainingAttempts: 0,
            };
        }
        // Cooldown expired - reset
        limitStore.set(key, { count: 1, firstAttempt: now, lastAttempt: now });
        return { allowed: true, retryAfterMs: 0, remainingAttempts: config.maxAttempts - 1 };
    }

    // Increment and allow
    entry.count += 1;
    entry.lastAttempt = now;
    return {
        allowed: true,
        retryAfterMs: 0,
        remainingAttempts: config.maxAttempts - entry.count,
    };
}

/**
 * Reset rate limit for a key (e.g., after successful login)
 */
export function resetRateLimit(key: string): void {
    limitStore.delete(key);
}

/**
 * Format retry time for display (Turkish)
 */
export function formatRetryTime(ms: number): string {
    const seconds = Math.ceil(ms / 1000);
    if (seconds < 60) return `${seconds} saniye`;
    const minutes = Math.ceil(seconds / 60);
    return `${minutes} dakika`;
}
