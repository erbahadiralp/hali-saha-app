import { differenceInDays } from 'date-fns';

// The profile overall itself is computed by the recalculateOverall Cloud Function; this module holds the
// shared formulas (display/group overall, skills) and the client-side estimate used before it exists.

// Position types
export type Position = 'FW' | 'MF' | 'DF' | 'GK';

// Position-based Archetypes
export type FWArchetype = 'fw-finisher' | 'fw-speedster' | 'fw-target-man' | 'fw-artist' | 'fw-poacher';
export type MFArchetype = 'mf-maestro' | 'mf-box-to-box' | 'mf-enganche' | 'mf-anchor' | 'mf-shadow-striker';
export type DFArchetype = 'df-wall' | 'df-butcher' | 'df-wing-back' | 'df-ball-playing' | 'df-sweeper';
export type GKArchetype = 'gk-reflex' | 'gk-giant' | 'gk-sweeper-keeper';

export type Archetype = FWArchetype | MFArchetype | DFArchetype | GKArchetype;

// Legacy support - map old archetypes to new ones
export function mapLegacyArchetype(oldArchetype: string, position: Position): Archetype {
    const mapping: Record<string, Record<Position, Archetype>> = {
        'finisher': { FW: 'fw-finisher', MF: 'mf-shadow-striker', DF: 'df-ball-playing', GK: 'gk-reflex' },
        'speedster': { FW: 'fw-speedster', MF: 'mf-box-to-box', DF: 'df-wing-back', GK: 'gk-sweeper-keeper' },
        'maestro': { FW: 'fw-artist', MF: 'mf-maestro', DF: 'df-ball-playing', GK: 'gk-sweeper-keeper' },
        'wall': { FW: 'fw-target-man', MF: 'mf-anchor', DF: 'df-wall', GK: 'gk-giant' },
        'box-to-box': { FW: 'fw-poacher', MF: 'mf-box-to-box', DF: 'df-sweeper', GK: 'gk-reflex' },
        'goalkeeper': { FW: 'fw-finisher', MF: 'mf-maestro', DF: 'df-wall', GK: 'gk-reflex' },
    };
    return mapping[oldArchetype]?.[position] || getDefaultArchetypeForPosition(position);
}

// Get archetypes available for a position
export function getArchetypesForPosition(position: Position): { value: Archetype; label: string; emoji: string; description: string }[] {
    switch (position) {
        case 'FW':
            return [
                { value: 'fw-finisher', label: 'Bitirici', emoji: '⚽', description: 'Şut: +20 | Fizik: +5 | Hız: -5 | Defans: -20' },
                { value: 'fw-speedster', label: 'Pırpır', emoji: '⚡', description: 'Hız: +20 | Pas: +5 | Şut: -5 | Fizik: -10' },
                { value: 'fw-target-man', label: 'Kule', emoji: '🗼', description: 'Fizik: +20 | Şut: +5 | Pas: +5 | Hız: -15' },
                { value: 'fw-artist', label: 'Fantasist', emoji: '🎨', description: 'Pas: +10 | Şut: +10 | Fizik: -10 | Defans: -10' },
                { value: 'fw-poacher', label: 'Fırsatçı', emoji: '🦊', description: 'Şut: +15 | Hız: +5 | Pas: -5 | Fizik: -5' },
            ];
        case 'MF':
            return [
                { value: 'mf-maestro', label: 'Maestro', emoji: '🧠', description: 'Pas: +20 | Şut: +5 | Hız: -10 | Fizik: -5' },
                { value: 'mf-box-to-box', label: 'Dinamo', emoji: '🥊', description: 'Hız: +10 | Fizik: +10 | Şut: +5 | Pas: +5' },
                { value: 'mf-enganche', label: '10 Numara', emoji: '🔟', description: 'Pas: +15 | Şut: +10 | Defans: -15 | Fizik: -5' },
                { value: 'mf-anchor', label: 'Kesici', emoji: '⚓', description: 'Defans: +15 | Fizik: +10 | Şut: -10 | Hız: -5' },
                { value: 'mf-shadow-striker', label: 'Hayalet', emoji: '👻', description: 'Şut: +15 | Hız: +5 | Pas: +5 | Defans: -5' },
            ];
        case 'DF':
            return [
                { value: 'df-wall', label: 'Duvar', emoji: '🧱', description: 'Defans: +20 | Fizik: +5 | Hız: -10 | Pas: -5' },
                { value: 'df-butcher', label: 'Kasap', emoji: '🛡️', description: 'Fizik: +20 | Defans: +10 | Pas: -15 | Hız: -5' },
                { value: 'df-wing-back', label: 'Modern Bek', emoji: '🏃', description: 'Hız: +15 | Pas: +10 | Defans: -5 | Fizik: -5' },
                { value: 'df-ball-playing', label: 'Libero', emoji: '🎯', description: 'Pas: +15 | Defans: +10 | Fizik: -5 | Hız: -5' },
                { value: 'df-sweeper', label: 'Süpürücü', emoji: '🧹', description: 'Hız: +10 | Defans: +15 | Fizik: -5 | Şut: -10' },
            ];
        case 'GK':
            return [
                { value: 'gk-reflex', label: 'Kedi', emoji: '🐱', description: 'Refleks: +20 | Uçma: +10 | Fizik: -10' },
                { value: 'gk-giant', label: 'Dev', emoji: '🦍', description: 'Fizik: +20 | Yer Tutma: +15 | Hız: -15' },
                { value: 'gk-sweeper-keeper', label: 'Libero Kaleci', emoji: '🦶', description: 'Pas: +20 | Hız: +10 | Refleks: -5' },
            ];
    }
}

// Get default archetype for a position
export function getDefaultArchetypeForPosition(position: Position): Archetype {
    switch (position) {
        case 'FW': return 'fw-poacher';
        case 'MF': return 'mf-box-to-box';
        case 'DF': return 'df-wall';
        case 'GK': return 'gk-reflex';
    }
}

export interface PlayerSkills {
    speed: number;
    shooting: number;
    passing: number;
    physical: number;
    defense: number;
    // Goalkeeper specific
    reflexes?: number;
    diving?: number;
}

export interface OverallData {
    skillScore: number;
    performanceScore: number;
    activityScore: number;
    totalOverall: number;
    skills: PlayerSkills;
    isCalibrating?: boolean;
    calibrationLabel?: string;
}

// === NEW OVERALL SYSTEM ===
// Display Overall = Average Group Base + Form Bonus + Activity Bonus + MVP Bonus + Win Rate Bonus

export interface DisplayOverallParams {
    groupBases: number[];       // Her grubun base overall'ı
    formScores: number[];       // Son 10 maçın form puanları (0-10)
    daysSinceLastMatch: number | null; // Son maçtan bu yana geçen gün (null = hiç maç yok)
    mvpCount: number;           // Toplam MVP sayısı
    winRate: number;            // Galibiyet oranı (0-1)
}

export interface DisplayOverallBreakdown {
    averageBase: number;
    formBonus: number;
    activityBonus: number;
    mvpBonus: number;
    winRateBonus: number;
    total: number;
}

// Archetype bonus modifiers
const ARCHETYPE_BONUSES: Record<Archetype, Partial<PlayerSkills>> = {
    // FW Archetypes
    'fw-finisher': { shooting: 20, physical: 5, speed: -5, defense: -20 },
    'fw-speedster': { speed: 20, passing: 5, shooting: -5, physical: -10 },
    'fw-target-man': { physical: 20, shooting: 5, passing: 5, speed: -15 },
    'fw-artist': { passing: 10, shooting: 10, physical: -10, defense: -10 },
    'fw-poacher': { shooting: 15, speed: 5, passing: -5, physical: -5 },

    // MF Archetypes
    'mf-maestro': { passing: 20, shooting: 5, speed: -10, physical: -5 },
    'mf-box-to-box': { speed: 10, physical: 10, shooting: 5, passing: 5 },
    'mf-enganche': { passing: 15, shooting: 10, defense: -15, physical: -5 },
    'mf-anchor': { defense: 15, physical: 10, shooting: -10, speed: -5 },
    'mf-shadow-striker': { shooting: 15, speed: 5, passing: 5, defense: -5 },

    // DF Archetypes
    'df-wall': { defense: 20, physical: 5, speed: -10, passing: -5 },
    'df-butcher': { physical: 20, defense: 10, passing: -15, speed: -5 },
    'df-wing-back': { speed: 15, passing: 10, defense: -5, physical: -5 },
    'df-ball-playing': { passing: 15, defense: 10, physical: -5, speed: -5 },
    'df-sweeper': { speed: 10, defense: 15, physical: -5, shooting: -10 },

    // GK Archetypes
    'gk-reflex': { speed: -10, shooting: -20, passing: -10, physical: -10, defense: 0, reflexes: 20, diving: 10 },
    'gk-giant': { speed: -15, shooting: -20, passing: -10, physical: 20, defense: 0, reflexes: 5, diving: 15 },
    'gk-sweeper-keeper': { speed: 10, shooting: -15, passing: 20, physical: 0, defense: 0, reflexes: -5, diving: 0 },
};

/**
 * Calculate skills based on skill level and archetype
 */
export function calculateSkills(skillLevel: number, archetype: Archetype): PlayerSkills {
    const baseScore = skillLevel * 10;
    const bonuses = ARCHETYPE_BONUSES[archetype] || {};

    const skills: PlayerSkills = {
        speed: Math.min(99, Math.max(1, baseScore + (bonuses.speed || 0))),
        shooting: Math.min(99, Math.max(1, baseScore + (bonuses.shooting || 0))),
        passing: Math.min(99, Math.max(1, baseScore + (bonuses.passing || 0))),
        physical: Math.min(99, Math.max(1, baseScore + (bonuses.physical || 0))),
        defense: Math.min(99, Math.max(1, baseScore + (bonuses.defense || 0))),
    };

    // Add goalkeeper specific stats
    if (archetype.startsWith('gk-')) {
        skills.reflexes = Math.min(99, Math.max(1, baseScore + (bonuses.reflexes || 0)));
        skills.diving = Math.min(99, Math.max(1, baseScore + (bonuses.diving || 0)));
    }

    return skills;
}

/**
 * Calculate skill score (average of all skills)
 */
export function calculateSkillScore(skills: PlayerSkills): number {
    const values = [skills.speed, skills.shooting, skills.passing, skills.physical, skills.defense];
    if (skills.reflexes !== undefined) values.push(skills.reflexes);
    if (skills.diving !== undefined) values.push(skills.diving);
    return values.reduce((a, b) => a + b, 0) / values.length;
}

/**
 * Calculate activity score based on last match date (LEGACY - kept for backward compatibility)
 */
export function calculateActivityScore(lastMatchDate: Date | null): number {
    if (!lastMatchDate) return 50;
    const daysSinceMatch = differenceInDays(new Date(), lastMatchDate);
    if (daysSinceMatch <= 30) return 100;
    const weeksPastThreshold = Math.floor((daysSinceMatch - 30) / 7);
    return Math.max(0, 100 - (weeksPastThreshold * 3));
}

/**
 * Check if player is still in calibration mode (<5 matches)
 */
export function isCalibrating(matchCount: number): boolean {
    return matchCount < 5;
}

/**
 * Get calibration label for display
 */
export function getCalibrationLabel(matchCount: number): string | undefined {
    if (matchCount < 5) return `Kalibrasyonda 🔄 (${matchCount}/5)`;
    return undefined;
}

// =====================================================
// NEW OVERALL SYSTEM - Hybrid Display/Group Overall
// =====================================================

/**
 * Calculate Group Base Overall from admin-set skill level
 * Formula: (Skill Level × 6) + 40
 * Range: 46 (skill 1) to 100 (skill 10)
 */
export function calculateGroupBase(skillLevel: number): number {
    const clamped = Math.max(1, Math.min(10, skillLevel));
    return (clamped * 6) + 40;
}

/**
 * Calculate Form Bonus from recent match form scores
 * Formula: (Average - 5) × 2
 * Range: -10 to +10
 * 
 * @param formScores - Array of form scores (0-10) from recent matches
 * @returns Form bonus value (-10 to +10)
 */
export function calculateFormBonus(formScores: number[]): number {
    if (!formScores || formScores.length === 0) return 0;
    const avg = formScores.reduce((a, b) => a + b, 0) / formScores.length;
    const bonus = (avg - 5) * 2;
    return Math.round(Math.max(-10, Math.min(10, bonus)));
}

/**
 * Calculate Activity Bonus based on days since last match
 * ≤ 7 days  → +3 (very active)
 * ≤ 14 days → +2 (active)
 * ≤ 30 days →  0 (normal)
 * ≤ 60 days → -2 (passive)
 * > 60 days → -3 (very passive)
 * 
 * @param daysSinceLastMatch - Days since last match, null if no matches
 * @returns Activity bonus (-3 to +3)
 */
export function calculateActivityBonus(daysSinceLastMatch: number | null): number {
    if (daysSinceLastMatch === null) return 0; // New player, neutral
    if (daysSinceLastMatch <= 7) return 3;
    if (daysSinceLastMatch <= 14) return 2;
    if (daysSinceLastMatch <= 30) return 0;
    if (daysSinceLastMatch <= 60) return -2;
    return -3;
}

/**
 * Calculate MVP Bonus
 * Formula: min(mvpCount × 0.3, 2)
 * Range: 0 to +2
 */
export function calculateMvpBonus(mvpCount: number): number {
    return Math.round(Math.min(mvpCount * 0.3, 2));
}

/**
 * Calculate Win Rate Bonus
 * Formula: clamp((winRate - 0.5) × 6, -3, +3)
 * 50% win rate = neutral (0)
 * Range: -3 to +3
 * 
 * @param winRate - Win rate as decimal (0-1)
 */
export function calculateWinRateBonus(winRate: number): number {
    const bonus = (winRate - 0.5) * 6;
    return Math.round(Math.max(-3, Math.min(3, bonus)));
}

/**
 * Calculate Display Overall with full breakdown
 * Display Overall = Average Group Base + Form Bonus + Activity Bonus + MVP Bonus + Win Rate Bonus
 * Range: 40-99
 */
export function calculateDisplayOverall(params: DisplayOverallParams): DisplayOverallBreakdown {
    // Average Group Base
    let averageBase: number;
    if (!params.groupBases || params.groupBases.length === 0) {
        averageBase = 65; // Default for player with no groups
    } else {
        averageBase = Math.round(params.groupBases.reduce((a, b) => a + b, 0) / params.groupBases.length);
    }

    const formBonus = calculateFormBonus(params.formScores);
    const activityBonus = calculateActivityBonus(params.daysSinceLastMatch);
    const mvpBonus = calculateMvpBonus(params.mvpCount);
    const winRateBonus = calculateWinRateBonus(params.winRate);

    const rawTotal = averageBase + formBonus + activityBonus + mvpBonus + winRateBonus;
    const total = Math.max(40, Math.min(99, rawTotal));

    return {
        averageBase,
        formBonus,
        activityBonus,
        mvpBonus,
        winRateBonus,
        total,
    };
}

/**
 * Calculate Group Match Overall (for team balancing in group matches)
 * Formula: Base Overall + Group Form Bonus
 * Group Form Bonus = (Son 5 maç ortalaması - 5) × 1.5
 * 
 * @param groupBase - The group base overall (from admin skill level)
 * @param recentGroupFormScores - Last 5 match form scores in this specific group
 * @returns Match overall for team balancing
 */
export function calculateGroupMatchOverall(groupBase: number, recentGroupFormScores: number[]): number {
    if (!recentGroupFormScores || recentGroupFormScores.length === 0) {
        return groupBase;
    }
    const avg = recentGroupFormScores.reduce((a, b) => a + b, 0) / recentGroupFormScores.length;
    const formBonus = Math.round((avg - 5) * 1.5);
    const result = groupBase + formBonus;
    return Math.max(40, Math.min(99, result));
}

// =====================================================
// LEGACY FUNCTIONS (kept for backward compatibility)
// =====================================================

/**
 * Get weight tiers based on match count (LEGACY)
 */
function getWeights(matchCount: number): { skill: number; performance: number; activity: number } {
    if (matchCount <= 3) {
        return { skill: 0.70, performance: 0.20, activity: 0.10 };
    } else if (matchCount <= 10) {
        return { skill: 0.50, performance: 0.35, activity: 0.15 };
    } else {
        return { skill: 0.40, performance: 0.40, activity: 0.20 };
    }
}

/**
 * Calculate total overall rating (LEGACY - used by old tests)
 */
export function calculateOverall(skillScore: number, performanceScore: number, activityScore: number, matchCount: number = 999): number {
    const w = getWeights(matchCount);
    return Math.round((skillScore * w.skill) + (performanceScore * w.performance) + (activityScore * w.activity));
}

/**
 * Get complete overall data for a player (LEGACY)
 */
export function getPlayerOverallData(
    skillLevel: number,
    archetype: Archetype,
    performanceScore: number,
    lastMatchDate: Date | null,
    matchCount: number = 999
): OverallData {
    const skills = calculateSkills(skillLevel, archetype);
    const skillScore = calculateSkillScore(skills);
    const activityScore = calculateActivityScore(lastMatchDate);
    const totalOverall = calculateOverall(skillScore, performanceScore, activityScore, matchCount);
    const calibrating = isCalibrating(matchCount);
    return {
        skillScore,
        performanceScore,
        activityScore,
        totalOverall,
        skills,
        isCalibrating: calibrating,
        calibrationLabel: getCalibrationLabel(matchCount),
    };
}

/**
 * Get default overall data for a new player
 */
export function getDefaultOverallData(): OverallData {
    return getPlayerOverallData(6, 'mf-box-to-box', 60, null);
}

/**
 * Apply position mismatch penalty (10% reduction)
 */
export function applyPositionPenalty(overall: number, isOutOfPosition: boolean): number {
    return isOutOfPosition ? Math.round(overall * 0.90) : overall;
}

/**
 * Calculate overall rating from user's profile statistics (LEGACY fallback)
 * Now uses the new Display Overall system when possible.
 * This is kept as a fallback for when group data is not available.
 * 
 * @param stats - User's profile stats object
 * @returns Calculated overall rating (40-99)
 */
export function calculateOverallFromStats(stats: {
    goals?: number;
    assists?: number;
    matchCount?: number;
    wins?: number;
    motmCount?: number;
    groupBases?: number[];
    formScores?: number[];
    daysSinceLastMatch?: number | null;
} | null | undefined): number {
    if (!stats) return 50;

    const matchCount = stats.matchCount || 0;
    if (matchCount === 0) return 50;

    // If we have group bases, use the new system
    if (stats.groupBases && stats.groupBases.length > 0) {
        const winRate = matchCount > 0 ? (stats.wins || 0) / matchCount : 0;
        const result = calculateDisplayOverall({
            groupBases: stats.groupBases,
            formScores: stats.formScores || [],
            daysSinceLastMatch: stats.daysSinceLastMatch ?? null,
            mvpCount: stats.motmCount || 0,
            winRate,
        });
        return result.total;
    }

    // Fallback: use old stat-based calculation if no group data
    const goals = stats.goals || 0;
    const assists = stats.assists || 0;
    const wins = stats.wins || 0;
    const motmCount = stats.motmCount || 0;

    const goalsPerMatch = goals / matchCount;
    const assistsPerMatch = assists / matchCount;
    const winRate = (wins / matchCount) * 100;

    const goalBonus = Math.min(20, goalsPerMatch * 10);
    const assistBonus = Math.min(15, assistsPerMatch * 10);
    const winBonus = Math.min(20, winRate * 0.25);
    const mvpBonus = Math.min(15, motmCount * 1.5);
    const experienceBonus = Math.min(10, matchCount * 0.5);

    const total = 20 + goalBonus + assistBonus + winBonus + mvpBonus + experienceBonus;
    return Math.min(99, Math.max(20, Math.round(total)));
}
