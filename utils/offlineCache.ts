/**
 * Simple offline cache utility using AsyncStorage.
 * Caches Firestore data locally with TTL (Time To Live).
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

const CACHE_PREFIX = '@cache:';
const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes

interface CacheEntry<T> {
    data: T;
    timestamp: number;
    ttl: number;
}

/**
 * Get cached data. Returns null if expired or not found.
 */
export async function getCached<T>(key: string): Promise<T | null> {
    try {
        const raw = await AsyncStorage.getItem(CACHE_PREFIX + key);
        if (!raw) return null;

        const entry: CacheEntry<T> = JSON.parse(raw);
        const now = Date.now();

        if (now - entry.timestamp > entry.ttl) {
            // Expired - remove it
            await AsyncStorage.removeItem(CACHE_PREFIX + key);
            return null;
        }

        return entry.data;
    } catch {
        return null;
    }
}

/**
 * Set cached data with optional TTL.
 */
export async function setCache<T>(key: string, data: T, ttl: number = DEFAULT_TTL): Promise<void> {
    try {
        const entry: CacheEntry<T> = {
            data,
            timestamp: Date.now(),
            ttl,
        };
        await AsyncStorage.setItem(CACHE_PREFIX + key, JSON.stringify(entry));
    } catch (error) {
        console.error('Cache write error:', error);
    }
}

/**
 * Remove cached data
 */
export async function removeCache(key: string): Promise<void> {
    try {
        await AsyncStorage.removeItem(CACHE_PREFIX + key);
    } catch {
        // Silently fail
    }
}

/**
 * Clear all cached data
 */
export async function clearAllCache(): Promise<void> {
    try {
        const allKeys = await AsyncStorage.getAllKeys();
        const cacheKeys = allKeys.filter(k => k.startsWith(CACHE_PREFIX));
        if (cacheKeys.length > 0) {
            await AsyncStorage.multiRemove(cacheKeys);
        }
    } catch (error) {
        console.error('Cache clear error:', error);
    }
}

/**
 * Fetch with cache - tries cache first, falls back to fetcher
 */
export async function fetchWithCache<T>(
    key: string,
    fetcher: () => Promise<T>,
    ttl: number = DEFAULT_TTL
): Promise<T> {
    // Try cache first
    const cached = await getCached<T>(key);
    if (cached !== null) return cached;

    // Fetch fresh data
    const data = await fetcher();
    await setCache(key, data, ttl);
    return data;
}

// Common cache keys
export const CACHE_KEYS = {
    userProfile: (userId: string) => `user:${userId}`,
    userGroups: (userId: string) => `groups:${userId}`,
    groupDetails: (groupId: string) => `group:${groupId}`,
    matchDetails: (matchId: string) => `match:${matchId}`,
    matchParticipants: (matchId: string) => `participants:${matchId}`,
};

// Cache TTLs
export const CACHE_TTL = {
    SHORT: 1 * 60 * 1000,       // 1 min (frequently changing data)
    MEDIUM: 5 * 60 * 1000,      // 5 min (default)
    LONG: 30 * 60 * 1000,       // 30 min (rarely changing data)
    VERY_LONG: 24 * 60 * 60 * 1000, // 24h (static data)
};
