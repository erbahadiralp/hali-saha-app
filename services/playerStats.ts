import { calculateMvpBonus, calculateWinRateBonus } from './overall';

/**
 * Single source for a player's headline numbers so every screen (Ana Sayfa, Profil, maç ekranları)
 * shows the same OVR. Match documents are preferred; profile counters cover history that predates them.
 */

export interface PlayerStats {
    matchesPlayed: number;
    goals: number;
    assists: number;
    wins: number;
    motmCount: number;
}

const toDate = (value: any): Date => {
    if (value && typeof value.toDate === 'function') return value.toDate();
    return value instanceof Date ? value : new Date(value);
};

export type MatchResult = 'win' | 'draw' | 'loss' | null;

/** Result from the player's point of view, given a match merged with its `playerStats` participation. */
export function matchResult(m: any): MatchResult {
    const ps = m.playerStats || {};
    if (m.scoreA === undefined || m.scoreB === undefined) return null;
    if (m.scoreA === m.scoreB) return 'draw';
    const won = !!(ps.won || (ps.team === 'A' && m.scoreA > m.scoreB) || (ps.team === 'B' && m.scoreB > m.scoreA));
    return won ? 'win' : 'loss';
}

/** Matches (from getUserMatches) the player was in and whose kick-off has passed, newest first. */
export function playedMatches(matches: any[], now = Date.now()): any[] {
    return matches
        .filter(m => m.playerStats?.status === 'IN' && toDate(m.date).getTime() < now)
        .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
}

/** Totals from played matches, falling back per field to the profile's stored counters. */
export function summarizeStats(profile: any, played: any[] = []): PlayerStats {
    const fromMatches = played.reduce<PlayerStats>((acc, m) => {
        const ps = m.playerStats || {};
        return {
            matchesPlayed: acc.matchesPlayed + 1,
            goals: acc.goals + (ps.goals || 0),
            assists: acc.assists + (ps.assists || 0),
            wins: acc.wins + (matchResult(m) === 'win' ? 1 : 0),
            motmCount: acc.motmCount + (ps.isMotm ? 1 : 0),
        };
    }, { matchesPlayed: 0, goals: 0, assists: 0, wins: 0, motmCount: 0 });

    const stored = profile?.stats || {};
    return {
        matchesPlayed: fromMatches.matchesPlayed || stored.matchesPlayed || profile?.matchesPlayed || 0,
        goals: fromMatches.goals || stored.goals || 0,
        assists: fromMatches.assists || stored.assists || 0,
        wins: fromMatches.wins || stored.wins || 0,
        motmCount: fromMatches.motmCount || stored.motmCount || 0,
    };
}

/** Neutral group base the server uses for a player nobody has rated yet. */
export const DEFAULT_GROUP_BASE = 65;

/**
 * The server-computed `overall` when present. Until the recalculateOverall Cloud Function has run, an
 * estimate on the same scale: neutral base + MVP bonus + win-rate bonus phased in over 5 matches
 * (form and activity need match history the server has).
 */
export function resolveOverall(profile: any, stats: PlayerStats = summarizeStats(profile)): number {
    if (profile?.overall) return Math.round(profile.overall);
    const weight = Math.min(1, stats.matchesPlayed / 5);
    const winRateBonus = stats.matchesPlayed > 0
        ? Math.round(calculateWinRateBonus(stats.wins / stats.matchesPlayed) * weight)
        : 0;
    const estimate = DEFAULT_GROUP_BASE + calculateMvpBonus(stats.motmCount) + winRateBonus;
    return Math.max(40, Math.min(99, estimate));
}

/**
 * Rating for team balancing and rosters. In a group match the admin-set group base (Oyuncu Güçleri) is
 * the anchor and the player's current form bonus from the server breakdown moves it; players without a
 * group level use their display overall.
 */
export function matchRating(profile: any, groupBase?: number | null): number {
    if (!groupBase) return resolveOverall(profile);
    const formBonus = profile?.overallBreakdown?.formBonus ?? 0;
    return Math.max(40, Math.min(99, Math.round(groupBase + formBonus)));
}
