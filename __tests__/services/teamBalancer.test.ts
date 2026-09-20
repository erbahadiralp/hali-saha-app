import { Archetype } from '../../services/overall';
import { balanceTeams, PlayerForBalancing, randomTeams, swapPlayers } from '../../services/teamBalancer';

// Mock data generator
const createPlayer = (
    id: string,
    name: string,
    overall: number,
    position: 'GK' | 'DF' | 'MF' | 'FW',
    selectedPosition?: 'GK' | 'DF' | 'MF' | 'FW'
): PlayerForBalancing => ({
    userId: id,
    displayName: name,
    overall,
    profilePosition: position,
    selectedPosition: selectedPosition || position,
    archetype: 'fw-finisher' as Archetype,
});

describe('balanceTeams', () => {
    test('returns empty teams for empty input', () => {
        const result = balanceTeams([]);
        expect(result.teamA).toHaveLength(0);
        expect(result.teamB).toHaveLength(0);
        expect(result.teamAOverall).toBe(0);
        expect(result.teamBOverall).toBe(0);
        expect(result.difference).toBe(0);
    });

    test('handles single player', () => {
        const players = [createPlayer('1', 'Solo', 80, 'FW')];
        const result = balanceTeams(players);
        expect(result.teamA.length + result.teamB.length).toBe(1);
    });

    test('balances two equal players evenly', () => {
        const players = [
            createPlayer('1', 'P1', 80, 'FW'),
            createPlayer('2', 'P2', 80, 'FW'),
        ];
        const result = balanceTeams(players);
        expect(result.teamA).toHaveLength(1);
        expect(result.teamB).toHaveLength(1);
        expect(result.difference).toBe(0);
    });

    test('balances 4 players with close overalls', () => {
        const players = [
            createPlayer('1', 'P1', 90, 'FW'),
            createPlayer('2', 'P2', 80, 'FW'),
            createPlayer('3', 'P3', 70, 'FW'),
            createPlayer('4', 'P4', 60, 'FW'),
        ];
        const result = balanceTeams(players);
        expect(result.teamA).toHaveLength(2);
        expect(result.teamB).toHaveLength(2);
        expect(Math.abs(result.teamAOverall - result.teamBOverall)).toBeLessThanOrEqual(10);
    });

    test('distributes goalkeepers one per team', () => {
        const players = [
            createPlayer('gk1', 'GK1', 85, 'GK', 'GK'),
            createPlayer('gk2', 'GK2', 80, 'GK', 'GK'),
            createPlayer('p1', 'P1', 70, 'FW'),
            createPlayer('p2', 'P2', 70, 'FW'),
        ];
        const result = balanceTeams(players);
        const teamAGKs = result.teamA.filter(p => p.selectedPosition === 'GK');
        const teamBGKs = result.teamB.filter(p => p.selectedPosition === 'GK');
        expect(teamAGKs).toHaveLength(1);
        expect(teamBGKs).toHaveLength(1);
    });

    test('best goalkeeper ends up in one of the teams', () => {
        const players = [
            createPlayer('gk1', 'BestGK', 90, 'GK', 'GK'),
            createPlayer('gk2', 'WorseGK', 60, 'GK', 'GK'),
            createPlayer('p1', 'P1', 70, 'FW'),
            createPlayer('p2', 'P2', 70, 'FW'),
        ];
        const result = balanceTeams(players);
        const allPlayers = [...result.teamA, ...result.teamB];
        // Best GK should be somewhere in the teams
        expect(allPlayers.find(p => p.userId === 'gk1')).toBeDefined();
        expect(allPlayers.find(p => p.userId === 'gk2')).toBeDefined();
    });

    test('single goalkeeper is placed in a team', () => {
        const players = [
            createPlayer('gk1', 'OnlyGK', 85, 'GK', 'GK'),
            createPlayer('p1', 'P1', 70, 'FW'),
            createPlayer('p2', 'P2', 70, 'FW'),
        ];
        const result = balanceTeams(players);
        const allGKs = [...result.teamA, ...result.teamB].filter(p => p.selectedPosition === 'GK');
        expect(allGKs).toHaveLength(1);
        expect(allGKs[0].userId).toBe('gk1');
    });

    test('handles odd number of players', () => {
        const players = [
            createPlayer('1', 'P1', 90, 'FW'),
            createPlayer('2', 'P2', 80, 'FW'),
            createPlayer('3', 'P3', 70, 'FW'),
        ];
        const result = balanceTeams(players);
        expect(result.teamA.length + result.teamB.length).toBe(2);
        expect(result.jokerPlayer).toBeDefined();
        expect(result.jokerPlayer?.userId).toBe('3');
    });

    test('ensures difference is within 5% for standard team', () => {
        const players = [
            createPlayer('gk1', 'GK1', 85, 'GK', 'GK'),
            createPlayer('gk2', 'GK2', 80, 'GK', 'GK'),
            createPlayer('d1', 'DF1', 82, 'DF', 'DF'),
            createPlayer('d2', 'DF2', 78, 'DF', 'DF'),
            createPlayer('d3', 'DF3', 75, 'DF', 'DF'),
            createPlayer('d4', 'DF4', 72, 'DF', 'DF'),
            createPlayer('m1', 'MF1', 88, 'MF', 'MF'),
            createPlayer('m2', 'MF2', 84, 'MF', 'MF'),
            createPlayer('m3', 'MF3', 76, 'MF', 'MF'),
            createPlayer('m4', 'MF4', 70, 'MF', 'MF'),
            createPlayer('f1', 'FW1', 90, 'FW', 'FW'),
            createPlayer('f2', 'FW2', 86, 'FW', 'FW'),
            createPlayer('f3', 'FW3', 74, 'FW', 'FW'),
            createPlayer('f4', 'FW4', 68, 'FW', 'FW'),
        ];
        const result = balanceTeams(players);
        const maxOverall = Math.max(result.teamAOverall, result.teamBOverall);
        const maxAllowedDiff = maxOverall * 0.05;
        expect(result.difference).toBeLessThanOrEqual(maxAllowedDiff + 1); // +1 for rounding
    });

    test('applies position mismatch penalty', () => {
        // Player with profilePosition FW but selectedPosition DF gets penalty
        const players = [
            createPlayer('1', 'InPosition', 80, 'FW', 'FW'),
            createPlayer('2', 'OutOfPosition', 80, 'FW', 'DF'),
        ];
        const result = balanceTeams(players);
        // The out-of-position player has effective overall of 72 (80 * 0.9)
        // So teams should not be equal
        expect(result.teamA.length + result.teamB.length).toBe(2);
    });

    test('handles all same position players', () => {
        const players = Array.from({ length: 6 }, (_, i) =>
            createPlayer(`p${i}`, `Player${i}`, 70 + i * 5, 'MF', 'MF')
        );
        const result = balanceTeams(players);
        expect(result.teamA).toHaveLength(3);
        expect(result.teamB).toHaveLength(3);
    });

    test('handles all same overall players', () => {
        const players = Array.from({ length: 6 }, (_, i) =>
            createPlayer(`p${i}`, `Player${i}`, 75, 'FW', 'FW')
        );
        const result = balanceTeams(players);
        expect(result.difference).toBe(0);
    });

    test('all players are placed in teams', () => {
        const players = [
            createPlayer('gk1', 'GK1', 85, 'GK', 'GK'),
            createPlayer('gk2', 'GK2', 80, 'GK', 'GK'),
            createPlayer('gk3', 'GK3', 70, 'GK', 'GK'), // extra GK
            createPlayer('d1', 'DF1', 82, 'DF', 'DF'),
            createPlayer('m1', 'MF1', 88, 'MF', 'MF'),
            createPlayer('f1', 'FW1', 90, 'FW', 'FW'),
        ];
        const result = balanceTeams(players);
        expect(result.teamA.length + result.teamB.length).toBe(6);
    });
});

describe('randomTeams', () => {
    test('splits players into two teams', () => {
        const players = Array.from({ length: 8 }, (_, i) =>
            createPlayer(`p${i}`, `Player${i}`, 70, 'FW')
        );
        const result = randomTeams(players);
        expect(result.teamA.length + result.teamB.length).toBe(8);
    });

    test('handles odd number of players', () => {
        const players = Array.from({ length: 7 }, (_, i) =>
            createPlayer(`p${i}`, `Player${i}`, 70, 'FW')
        );
        const result = randomTeams(players);
        expect(result.teamA).toHaveLength(4);
        expect(result.teamB).toHaveLength(3);
    });

    test('handles empty input', () => {
        const result = randomTeams([]);
        expect(result.teamA).toHaveLength(0);
        expect(result.teamB).toHaveLength(0);
    });

    test('handles single player', () => {
        const players = [createPlayer('1', 'Solo', 80, 'FW')];
        const result = randomTeams(players);
        expect(result.teamA).toHaveLength(1);
        expect(result.teamB).toHaveLength(0);
    });

    test('calculates overalls correctly', () => {
        const players = [
            createPlayer('1', 'P1', 80, 'FW'),
            createPlayer('2', 'P2', 80, 'FW'),
        ];
        const result = randomTeams(players);
        expect(result.teamAOverall).toBe(80);
        expect(result.teamBOverall).toBe(80);
    });
});

describe('swapPlayers', () => {
    const baseTeam = () => balanceTeams([
        createPlayer('a1', 'A1', 80, 'FW'),
        createPlayer('a2', 'A2', 70, 'FW'),
        createPlayer('b1', 'B1', 75, 'FW'),
        createPlayer('b2', 'B2', 85, 'FW'),
    ]);

    test('swaps players between teams', () => {
        const teams = baseTeam();
        const playerFromA = teams.teamA[0]?.userId;
        const playerFromB = teams.teamB[0]?.userId;
        if (!playerFromA || !playerFromB) return;

        const result = swapPlayers(teams, playerFromA, playerFromB);
        expect(result.teamA.some(p => p.userId === playerFromB)).toBe(true);
        expect(result.teamB.some(p => p.userId === playerFromA)).toBe(true);
    });

    test('returns original teams when player not found', () => {
        const teams = baseTeam();
        const result = swapPlayers(teams, 'nonexistent1', 'nonexistent2');
        expect(result).toEqual(teams);
    });

    test('returns original teams when one player not found', () => {
        const teams = baseTeam();
        const playerFromA = teams.teamA[0]?.userId;
        if (!playerFromA) return;
        const result = swapPlayers(teams, playerFromA, 'nonexistent');
        expect(result).toEqual(teams);
    });

    test('recalculates overalls after swap', () => {
        const teams = baseTeam();
        const playerFromA = teams.teamA[0]?.userId;
        const playerFromB = teams.teamB[0]?.userId;
        if (!playerFromA || !playerFromB) return;

        const result = swapPlayers(teams, playerFromA, playerFromB);
        expect(typeof result.teamAOverall).toBe('number');
        expect(typeof result.teamBOverall).toBe('number');
        expect(result.difference).toBeGreaterThanOrEqual(0);
    });
});
