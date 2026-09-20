import { applyPositionPenalty, Archetype } from './overall';

export type Position = 'GK' | 'DF' | 'MF' | 'FW';

export interface PlayerForBalancing {
    userId: string;
    displayName: string;
    photoURL?: string;
    overall: number;
    profilePosition: Position;
    selectedPosition: Position; // Position they'll play this match
    archetype: Archetype;
    matchCount?: number; // For calibration ordering
}

export interface BalancedTeam {
    teamA: PlayerForBalancing[];
    teamB: PlayerForBalancing[];
    teamAOverall: number;
    teamBOverall: number;
    difference: number;
    jokerPlayer?: PlayerForBalancing; // ODD_PLAYER: Joker for odd-count matches
}

/**
 * Apply position mismatch penalty if playing out of position
 */
function getEffectiveOverall(player: PlayerForBalancing): number {
    const isOutOfPosition = player.profilePosition !== player.selectedPosition;
    return applyPositionPenalty(player.overall, isOutOfPosition);
}

/**
 * Calculate total team overall
 */
function calculateTeamOverall(team: PlayerForBalancing[]): number {
    if (team.length === 0) return 0;
    const total = team.reduce((sum, p) => sum + getEffectiveOverall(p), 0);
    return Math.round(total / team.length);
}

/**
 * Snake Draft: Distribute players alternating between teams
 * Pattern for 4 players: B, A, A, B
 */
function snakeDraft(players: PlayerForBalancing[]): { teamA: PlayerForBalancing[], teamB: PlayerForBalancing[] } {
    const sorted = [...players].sort((a, b) => getEffectiveOverall(b) - getEffectiveOverall(a));

    const teamA: PlayerForBalancing[] = [];
    const teamB: PlayerForBalancing[] = [];

    sorted.forEach((player, index) => {
        // Snake pattern: 0->B, 1->A, 2->A, 3->B, 4->B, 5->A...
        const round = Math.floor(index / 2);
        const position = index % 2;

        if (round % 2 === 0) {
            // Even rounds: 0->B, 1->A
            if (position === 0) teamB.push(player);
            else teamA.push(player);
        } else {
            // Odd rounds: 0->A, 1->B
            if (position === 0) teamA.push(player);
            else teamB.push(player);
        }
    });

    return { teamA, teamB };
}

/**
 * Distribute remaining players to balance team overall
 * Uses greedy approach based on TOTAL sum, not average
 */
function distributeToBalance(
    players: PlayerForBalancing[],
    teamA: PlayerForBalancing[],
    teamB: PlayerForBalancing[]
): { teamA: PlayerForBalancing[], teamB: PlayerForBalancing[] } {
    // Sort by overall descending (snake draft approach is more balanced)
    const sorted = [...players].sort((a, b) => getEffectiveOverall(b) - getEffectiveOverall(a));

    // Use snake draft for better balance
    let teamATurn = true;
    for (let i = 0; i < sorted.length; i++) {
        const player = sorted[i];

        // Calculate current totals
        const teamATotal = teamA.reduce((sum, p) => sum + getEffectiveOverall(p), 0);
        const teamBTotal = teamB.reduce((sum, p) => sum + getEffectiveOverall(p), 0);

        // Add to team with lower total, or alternate if close
        if (teamA.length === 0 && teamB.length === 0) {
            teamA.push(player);
        } else if (Math.abs(teamATotal - teamBTotal) < 5) {
            // Very close - alternate
            if (teamATurn) {
                teamA.push(player);
            } else {
                teamB.push(player);
            }
            teamATurn = !teamATurn;
        } else if (teamATotal <= teamBTotal) {
            teamA.push(player);
        } else {
            teamB.push(player);
        }
    }

    return { teamA, teamB };
}

/**
 * Main team balancing algorithm
 * 
 * Steps:
 * 1. Separate players by position
 * 2. Apply position mismatch penalty
 * 3. Distribute goalkeepers 1-1
 * 4. Snake draft defenders
 * 5. Distribute attackers/midfielders to balance
 */
export function balanceTeams(players: PlayerForBalancing[]): BalancedTeam {
    // ODD_PLAYER: Handle odd number of players
    let jokerPlayer: PlayerForBalancing | undefined;
    let activePlayers = [...players];

    if (activePlayers.length % 2 !== 0 && activePlayers.length > 1) {
        // Find lowest overall player as joker
        const sorted = [...activePlayers].sort((a, b) => getEffectiveOverall(a) - getEffectiveOverall(b));
        jokerPlayer = sorted[0];
        activePlayers = activePlayers.filter(p => p.userId !== jokerPlayer!.userId);
    }

    // CALIBRATION_IN_BALANCING: Separate calibrating players (< 5 matches)
    const calibratingPlayers = activePlayers.filter(p => (p.matchCount ?? 999) < 5);
    const regularPlayers = activePlayers.filter(p => (p.matchCount ?? 999) >= 5);

    // Separate regular players by position
    const goalkeepers = regularPlayers.filter(p => p.selectedPosition === 'GK');
    const defenders = regularPlayers.filter(p => p.selectedPosition === 'DF');
    const midfielders = regularPlayers.filter(p => p.selectedPosition === 'MF');
    const forwards = regularPlayers.filter(p => p.selectedPosition === 'FW');

    let teamA: PlayerForBalancing[] = [];
    let teamB: PlayerForBalancing[] = [];

    // Step 1: POSITION_QUOTA - Distribute Goalkeepers (min 1 each if available)
    if (goalkeepers.length >= 2) {
        const sortedGKs = [...goalkeepers].sort((a, b) => getEffectiveOverall(b) - getEffectiveOverall(a));
        teamA.push(sortedGKs[0]);
        teamB.push(sortedGKs[1]);
        if (goalkeepers.length > 2) {
            // Extra GKs go to midfield pool
            midfielders.push(...sortedGKs.slice(2));
        }
    } else if (goalkeepers.length === 1) {
        teamA.push(goalkeepers[0]);
    }

    // Step 2: Snake Draft Defenders (maintain position structure)
    if (defenders.length > 0) {
        const defDraft = snakeDraft(defenders);
        teamA.push(...defDraft.teamA);
        teamB.push(...defDraft.teamB);
    }

    // Step 3: Distribute Midfielders + Forwards to balance
    const attackingPlayers = [...midfielders, ...forwards];
    if (attackingPlayers.length > 0) {
        const attackDist = distributeToBalance(attackingPlayers, teamA, teamB);
        teamA = attackDist.teamA;
        teamB = attackDist.teamB;
    }

    // Step 4: CALIBRATION_IN_BALANCING - Add calibrating players LAST (greedy)
    if (calibratingPlayers.length > 0) {
        const calDist = distributeToBalance(calibratingPlayers, teamA, teamB);
        teamA = calDist.teamA;
        teamB = calDist.teamB;
    }

    // Post-balance: iterative swap to ensure max 5% difference
    const targetMaxDiff = Math.max(
        calculateTeamOverall(teamA),
        calculateTeamOverall(teamB)
    ) * 0.05;

    for (let phase = 0; phase < 2; phase++) {
        let improved = true;
        let iterations = 0;
        while (improved && iterations < 100) {
            improved = false;
            iterations++;
            const currentDiff = Math.abs(calculateTeamOverall(teamA) - calculateTeamOverall(teamB));
            if (currentDiff <= targetMaxDiff) break;

            let bestSwap: { i: number; j: number; diff: number } | null = null;

            for (let i = 0; i < teamA.length; i++) {
                for (let j = 0; j < teamB.length; j++) {
                    if (phase === 0 && teamA[i].selectedPosition !== teamB[j].selectedPosition) continue;

                    const tmpA = [...teamA];
                    const tmpB = [...teamB];
                    [tmpA[i], tmpB[j]] = [tmpB[j], tmpA[i]];
                    const newDiff = Math.abs(calculateTeamOverall(tmpA) - calculateTeamOverall(tmpB));

                    if (newDiff < currentDiff && (!bestSwap || newDiff < bestSwap.diff)) {
                        bestSwap = { i, j, diff: newDiff };
                    }
                }
            }

            if (bestSwap) {
                [teamA[bestSwap.i], teamB[bestSwap.j]] = [teamB[bestSwap.j], teamA[bestSwap.i]];
                improved = true;
            }
        }

        if (Math.abs(calculateTeamOverall(teamA) - calculateTeamOverall(teamB)) <= targetMaxDiff) break;
    }

    // POSITION_QUOTA validation: Ensure each team has at least 1 GK if possible
    const teamAHasGK = teamA.some(p => p.selectedPosition === 'GK');
    const teamBHasGK = teamB.some(p => p.selectedPosition === 'GK');
    if (!teamAHasGK && teamBHasGK) {
        // Try to swap a GK from B to A
        const bGKIndex = teamB.findIndex(p => p.selectedPosition === 'GK');
        if (bGKIndex !== -1 && teamB.filter(p => p.selectedPosition === 'GK').length > 1) {
            const gk = teamB.splice(bGKIndex, 1)[0];
            teamA.push(gk);
        }
    } else if (teamAHasGK && !teamBHasGK) {
        const aGKIndex = teamA.findIndex(p => p.selectedPosition === 'GK');
        if (aGKIndex !== -1 && teamA.filter(p => p.selectedPosition === 'GK').length > 1) {
            const gk = teamA.splice(aGKIndex, 1)[0];
            teamB.push(gk);
        }
    }

    const teamAOverall = calculateTeamOverall(teamA);
    const teamBOverall = calculateTeamOverall(teamB);
    const difference = Math.abs(teamAOverall - teamBOverall);

    return {
        teamA,
        teamB,
        teamAOverall,
        teamBOverall,
        difference,
        jokerPlayer
    };
}

/**
 * Random team distribution (for Free users)
 * No balancing, just random shuffle and split
 */
export function randomTeams(players: PlayerForBalancing[]): BalancedTeam {
    const shuffled = [...players].sort(() => Math.random() - 0.5);
    const midpoint = Math.ceil(shuffled.length / 2);

    const teamA = shuffled.slice(0, midpoint);
    const teamB = shuffled.slice(midpoint);

    const teamAOverall = calculateTeamOverall(teamA);
    const teamBOverall = calculateTeamOverall(teamB);
    const difference = Math.abs(teamAOverall - teamBOverall);

    return {
        teamA,
        teamB,
        teamAOverall,
        teamBOverall,
        difference
    };
}

/**
 * Swap two players between teams (for captain drag-drop)
 */
export function swapPlayers(
    teams: BalancedTeam,
    playerAId: string,
    playerBId: string
): BalancedTeam {
    const newTeamA = [...teams.teamA];
    const newTeamB = [...teams.teamB];

    const playerAIndexInA = newTeamA.findIndex(p => p.userId === playerAId);
    const playerAIndexInB = newTeamB.findIndex(p => p.userId === playerAId);
    const playerBIndexInA = newTeamA.findIndex(p => p.userId === playerBId);
    const playerBIndexInB = newTeamB.findIndex(p => p.userId === playerBId);

    // Find players
    let playerA: PlayerForBalancing | undefined;
    let playerB: PlayerForBalancing | undefined;

    if (playerAIndexInA !== -1) playerA = newTeamA[playerAIndexInA];
    else if (playerAIndexInB !== -1) playerA = newTeamB[playerAIndexInB];

    if (playerBIndexInA !== -1) playerB = newTeamA[playerBIndexInA];
    else if (playerBIndexInB !== -1) playerB = newTeamB[playerBIndexInB];

    if (!playerA || !playerB) return teams; // Can't swap

    // Perform swap
    if (playerAIndexInA !== -1 && playerBIndexInB !== -1) {
        // A is in TeamA, B is in TeamB - swap them
        newTeamA[playerAIndexInA] = playerB;
        newTeamB[playerBIndexInB] = playerA;
    } else if (playerAIndexInB !== -1 && playerBIndexInA !== -1) {
        // A is in TeamB, B is in TeamA - swap them
        newTeamB[playerAIndexInB] = playerB;
        newTeamA[playerBIndexInA] = playerA;
    }
    // If both in same team, no swap needed

    const teamAOverall = calculateTeamOverall(newTeamA);
    const teamBOverall = calculateTeamOverall(newTeamB);

    return {
        teamA: newTeamA,
        teamB: newTeamB,
        teamAOverall,
        teamBOverall,
        difference: Math.abs(teamAOverall - teamBOverall)
    };
}
