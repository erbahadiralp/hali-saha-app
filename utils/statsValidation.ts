/**
 * Enhanced stats validation for post-match data.
 * Ensures goals, assists, and other stats are consistent.
 */

export interface PlayerStats {
    userId: string;
    team: 'A' | 'B';
    goals: number;
    assists: number;
    saves?: number;
    cleanSheet?: boolean;
    cards?: number;
    ownGoals?: number;
}

export interface MatchScore {
    scoreA: number;
    scoreB: number;
}

export interface ValidationError {
    field: string;
    message: string;
}

/**
 * Validate total stats for a match.
 * - Total goals per team must equal score
 * - Assists per team cannot exceed goals
 * - Clean sheet consistency check
 */
export function validateMatchStats(
    players: PlayerStats[],
    score: MatchScore
): ValidationError[] {
    const errors: ValidationError[] = [];

    const teamA = players.filter(p => p.team === 'A');
    const teamB = players.filter(p => p.team === 'B');

    // Goals validation
    const teamAGoals = teamA.reduce((sum, p) => sum + (p.goals || 0), 0);
    const teamBGoals = teamB.reduce((sum, p) => sum + (p.goals || 0), 0);

    // Account for own goals (own goals count for the other team)
    const teamAOwnGoals = teamA.reduce((sum, p) => sum + (p.ownGoals || 0), 0);
    const teamBOwnGoals = teamB.reduce((sum, p) => sum + (p.ownGoals || 0), 0);

    const effectiveTeamAGoals = teamAGoals + teamBOwnGoals;
    const effectiveTeamBGoals = teamBGoals + teamAOwnGoals;

    if (effectiveTeamAGoals > score.scoreA) {
        errors.push({
            field: 'teamA.goals',
            message: `Takım A'nın toplam golleri (${effectiveTeamAGoals}) skoru (${score.scoreA}) aşıyor.`,
        });
    }

    if (effectiveTeamBGoals > score.scoreB) {
        errors.push({
            field: 'teamB.goals',
            message: `Takım B'nin toplam golleri (${effectiveTeamBGoals}) skoru (${score.scoreB}) aşıyor.`,
        });
    }

    // Assists validation
    const teamAAssists = teamA.reduce((sum, p) => sum + (p.assists || 0), 0);
    const teamBAssists = teamB.reduce((sum, p) => sum + (p.assists || 0), 0);

    if (teamAAssists > teamAGoals) {
        errors.push({
            field: 'teamA.assists',
            message: `Takım A'nın asist sayısı (${teamAAssists}) gol sayısını (${teamAGoals}) aşamaz.`,
        });
    }

    if (teamBAssists > teamBGoals) {
        errors.push({
            field: 'teamB.assists',
            message: `Takım B'nin asist sayısı (${teamBAssists}) gol sayısını (${teamBGoals}) aşamaz.`,
        });
    }

    // Clean sheet consistency
    const teamACleanSheets = teamA.filter(p => p.cleanSheet);
    const teamBCleanSheets = teamB.filter(p => p.cleanSheet);

    if (teamACleanSheets.length > 0 && score.scoreB > 0) {
        errors.push({
            field: 'teamA.cleanSheet',
            message: 'Takım A gol yemişken clean sheet olamaz.',
        });
    }

    if (teamBCleanSheets.length > 0 && score.scoreA > 0) {
        errors.push({
            field: 'teamB.cleanSheet',
            message: 'Takım B gol yemişken clean sheet olamaz.',
        });
    }

    // Individual validation
    for (const player of players) {
        if (player.goals < 0) {
            errors.push({
                field: `${player.userId}.goals`,
                message: 'Gol sayısı negatif olamaz.',
            });
        }
        if (player.assists < 0) {
            errors.push({
                field: `${player.userId}.assists`,
                message: 'Asist sayısı negatif olamaz.',
            });
        }
    }

    return errors;
}

/**
 * Validate a single player's stats against team score
 */
export function validatePlayerStats(
    goals: number,
    assists: number,
    teamScore: number
): string | null {
    if (goals < 0 || assists < 0) return 'Değerler negatif olamaz.';
    if (goals > teamScore) return `Gol sayısı (${goals}) takım skorunu (${teamScore}) aşamaz.`;
    if (assists > teamScore) return `Asist sayısı (${assists}) takım gol sayısını (${teamScore}) aşamaz.`;
    return null;
}
