
// MVP Scoring based on position
// Different actions have different point values per position

export type MatchPosition = 'FW' | 'MF' | 'DF' | 'GK';

export const normalizePosition = (pos: string): MatchPosition => {
    if (!pos) return 'MF';
    const map: Record<string, MatchPosition> = {
        'FWD': 'FW', 'Forvet': 'FW', 'FW': 'FW',
        'MID': 'MF', 'Ortasaha': 'MF', 'Orta Saha': 'MF', 'MF': 'MF', 'MD': 'MF',
        'DEF': 'DF', 'Defans': 'DF', 'DF': 'DF',
        'GK': 'GK', 'Kaleci': 'GK'
    };
    return map[pos] || 'MF';
};

export interface MatchAction {
    goals: number;
    assists: number;
    cleanSheet: boolean;
    saves: number;
    penaltySaves: number;
    ownGoals: number;
    cards: number; // Yellow = 1, Red = 2
    teamWon: boolean;
}

// Point values per position
const SCORING_TABLE = {
    FW: { goal: 10, assist: 7, cleanSheet: 2, save: 0, penaltySave: 0, teamWin: 5, negative: -5 },
    MF: { goal: 10, assist: 7, cleanSheet: 2, save: 0, penaltySave: 0, teamWin: 5, negative: -5 },
    DF: { goal: 15, assist: 10, cleanSheet: 15, save: 2, penaltySave: 0, teamWin: 5, negative: -5 },
    GK: { goal: 50, assist: 20, cleanSheet: 25, save: 4, penaltySave: 20, teamWin: 5, negative: -5 }
};

/**
 * Calculate MVP score for a player based on their match actions
 * GOALKEEPER_HERO_BONUS: If losing team GK, saves get 1.5x multiplier
 */
export function calculateMvpScore(position: MatchPosition, actions: MatchAction): number {
    const table = SCORING_TABLE[position];

    let score = 0;

    score += actions.goals * table.goal;
    score += actions.assists * table.assist;
    score += actions.cleanSheet ? table.cleanSheet : 0;

    // GOALKEEPER_HERO_BONUS: Losing team keeper gets 1.5x save multiplier
    const saveMultiplier = (position === 'GK' && !actions.teamWon) ? 1.5 : 1;
    score += actions.saves * table.save * saveMultiplier;

    score += actions.penaltySaves * table.penaltySave;
    score += actions.teamWon ? table.teamWin : 0;

    // Negative points
    score += actions.ownGoals * table.negative;
    score += actions.cards * table.negative;

    return Math.max(0, score);
}

export interface MvpCandidate {
    odaylarId: string;
    displayName: string;
    photoURL?: string;
    position: MatchPosition;
    team: 'A' | 'B';
    mvpScore: number;
    isJoker?: boolean; // Admin selected 5th candidate
    stats: MatchAction; // Stats for UI display
}

// King of the Hill voting types
export interface MvpVote {
    matchId: string;
    odaylar1Id: string;
    odaylar2Id: string;
    secilenId: string;
    oylayanId: string;
    timestamp: Date;
}

export interface MvpVotingSession {
    matchId: string;
    candidates: MvpCandidate[];
    currentDuel: { odaylar1Id: string; odaylar2Id: string } | null;
    results: { odaylarId: string; wins: number }[];
    isComplete: boolean;
    mvpId?: string;
}

/**
 * Generate King of the Hill matchups with SEEDING
 * MVP_SEEDING: Tennis-style seeding (1v8, 2v7, 3v6, 4v5)
 * Prevents strongest candidates from meeting early
 */
export function generateKingOfTheHillMatchups(candidates: MvpCandidate[]): { aday1: string; aday2: string }[] {
    if (candidates.length < 2) return [];

    // Sort by MVP score descending (seeding)
    const seeded = [...candidates].sort((a, b) => b.mvpScore - a.mvpScore);

    const matchups: { aday1: string; aday2: string }[] = [];
    const n = seeded.length;

    // First matchup: lowest two seeds face off
    matchups.push({
        aday1: seeded[n - 2].odaylarId,
        aday2: seeded[n - 1].odaylarId
    });

    // Subsequent matchups: Winner faces next higher seed
    for (let i = 3; i <= n; i++) {
        matchups.push({
            aday1: 'WINNER',
            aday2: seeded[n - i].odaylarId
        });
    }

    return matchups;
}

export type BadgeType = 'gol-krali' | 'duvar' | 'asistci' | 'mvp-yuksek';

export function getPlayerBadges(candidate: MvpCandidate, allCandidates: MvpCandidate[]): BadgeType[] {
    const badges: BadgeType[] = [];
    const stats = candidate.stats;

    // Gol Kralı: Max goals in match (simulated by comparing with others here, assuming allCandidates passed)
    // Or simple heuristic: >= 2 goals
    if (stats.goals >= 2) {
        badges.push('gol-krali');
    }

    // Asistçi: >= 2 assists
    if (stats.assists >= 2) {
        badges.push('asistci');
    }

    // Duvar: Clean sheet for DF/GK or many saves/interceptions
    if ((candidate.position === 'GK' || candidate.position === 'DF') && stats.cleanSheet) {
        badges.push('duvar');
    }
    if (candidate.position === 'GK' && stats.saves >= 5) {
        if (!badges.includes('duvar')) badges.push('duvar');
    }

    // MVP Yüksek Puan
    if (candidate.mvpScore >= 100) { // Adjusted threshold based on scoring table
        badges.push('mvp-yuksek');
    }

    return badges;
}
