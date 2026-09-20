import { calculateMvpScore, generateKingOfTheHillMatchups, getPlayerBadges, MvpCandidate, MatchAction, MatchPosition } from '../../services/mvpLogic';

describe('calculateMvpScore', () => {
    const baseActions: MatchAction = {
        goals: 0,
        assists: 0,
        cleanSheet: false,
        saves: 0,
        penaltySaves: 0,
        ownGoals: 0,
        cards: 0,
        teamWon: false,
    };

    test('returns 0 for no actions', () => {
        expect(calculateMvpScore('FW', baseActions)).toBe(0);
    });

    test('calculates forward goals correctly (10 pts each)', () => {
        expect(calculateMvpScore('FW', { ...baseActions, goals: 2 })).toBe(20);
    });

    test('calculates forward assists correctly (7 pts each)', () => {
        expect(calculateMvpScore('FW', { ...baseActions, assists: 3 })).toBe(21);
    });

    test('calculates GK goal correctly (50 pts)', () => {
        expect(calculateMvpScore('GK', { ...baseActions, goals: 1 })).toBe(50);
    });

    test('calculates GK clean sheet (25 pts)', () => {
        expect(calculateMvpScore('GK', { ...baseActions, cleanSheet: true })).toBe(25);
    });

    test('calculates GK saves (4 pts each)', () => {
        expect(calculateMvpScore('GK', { ...baseActions, teamWon: true, saves: 5 })).toBe(25); // 20 + 5 (win)
    });

    test('calculates GK saves with losing team multiplier (1.5x)', () => {
        expect(calculateMvpScore('GK', { ...baseActions, teamWon: false, saves: 5 })).toBe(30); // 20 * 1.5
    });

    test('calculates GK penalty saves (20 pts each)', () => {
        expect(calculateMvpScore('GK', { ...baseActions, penaltySaves: 2 })).toBe(40);
    });

    test('DF clean sheet is worth 15 pts', () => {
        expect(calculateMvpScore('DF', { ...baseActions, cleanSheet: true })).toBe(15);
    });

    test('DF goal is worth 15 pts', () => {
        expect(calculateMvpScore('DF', { ...baseActions, goals: 1 })).toBe(15);
    });

    test('team win adds 5 pts', () => {
        expect(calculateMvpScore('MF', { ...baseActions, teamWon: true })).toBe(5);
    });

    test('own goals subtract points', () => {
        expect(calculateMvpScore('FW', { ...baseActions, ownGoals: 1 })).toBe(0); // max(0, -5)
        expect(calculateMvpScore('FW', { ...baseActions, goals: 2, ownGoals: 1 })).toBe(15); // 20 - 5
    });

    test('cards subtract points', () => {
        expect(calculateMvpScore('FW', { ...baseActions, cards: 2 })).toBe(0); // max(0, -10)
    });

    test('score never goes below 0', () => {
        expect(calculateMvpScore('FW', { ...baseActions, ownGoals: 5, cards: 5 })).toBe(0);
    });

    test('complex scenario: forward with 2 goals, 1 assist, team win', () => {
        const actions: MatchAction = { ...baseActions, goals: 2, assists: 1, teamWon: true };
        // 20 + 7 + 5 = 32
        expect(calculateMvpScore('FW', actions)).toBe(32);
    });

    test('complex scenario: GK with clean sheet, 3 saves, penalty save, team win', () => {
        const actions: MatchAction = { ...baseActions, cleanSheet: true, saves: 3, penaltySaves: 1, teamWon: true };
        // 25 + 12 + 20 + 5 = 62
        expect(calculateMvpScore('GK', actions)).toBe(62);
    });
});

describe('generateKingOfTheHillMatchups', () => {
    const makeCandidate = (id: string): MvpCandidate => ({
        odaylarId: id,
        displayName: `Player ${id}`,
        position: 'FW',
        team: 'A',
        mvpScore: 10,
        stats: {
            goals: 1, assists: 0, cleanSheet: false,
            saves: 0, penaltySaves: 0, ownGoals: 0, cards: 0, teamWon: true,
        },
    });

    test('returns empty array for less than 2 candidates', () => {
        expect(generateKingOfTheHillMatchups([])).toEqual([]);
        expect(generateKingOfTheHillMatchups([makeCandidate('1')])).toEqual([]);
    });

    test('returns 1 matchup for 2 candidates', () => {
        const matchups = generateKingOfTheHillMatchups([makeCandidate('1'), makeCandidate('2')]);
        expect(matchups).toHaveLength(1);
        expect(matchups[0].aday1).toBeDefined();
        expect(matchups[0].aday2).toBeDefined();
    });

    test('returns N-1 matchups for N candidates', () => {
        const candidates = [makeCandidate('1'), makeCandidate('2'), makeCandidate('3'), makeCandidate('4')];
        const matchups = generateKingOfTheHillMatchups(candidates);
        expect(matchups).toHaveLength(3);
    });

    test('first matchup has two real candidate IDs', () => {
        const candidates = [makeCandidate('a'), makeCandidate('b'), makeCandidate('c')];
        const matchups = generateKingOfTheHillMatchups(candidates);
        expect(matchups[0].aday1).not.toBe('WINNER');
        expect(matchups[0].aday2).not.toBe('WINNER');
    });

    test('subsequent matchups use WINNER placeholder', () => {
        const candidates = [makeCandidate('1'), makeCandidate('2'), makeCandidate('3')];
        const matchups = generateKingOfTheHillMatchups(candidates);
        expect(matchups[1].aday1).toBe('WINNER');
    });
});

describe('getPlayerBadges', () => {
    const makeCandidate = (overrides: Partial<MvpCandidate>): MvpCandidate => ({
        odaylarId: 'p1',
        displayName: 'Player',
        position: 'FW',
        team: 'A',
        mvpScore: 10,
        stats: {
            goals: 0, assists: 0, cleanSheet: false,
            saves: 0, penaltySaves: 0, ownGoals: 0, cards: 0, teamWon: true,
        },
        ...overrides,
    });

    test('returns empty for player with no notable actions', () => {
        const badges = getPlayerBadges(makeCandidate({}), []);
        expect(badges).toEqual([]);
    });

    test('returns gol-krali for 2+ goals', () => {
        const candidate = makeCandidate({
            stats: { goals: 2, assists: 0, cleanSheet: false, saves: 0, penaltySaves: 0, ownGoals: 0, cards: 0, teamWon: true },
        });
        expect(getPlayerBadges(candidate, [])).toContain('gol-krali');
    });

    test('returns asistci for 2+ assists', () => {
        const candidate = makeCandidate({
            stats: { goals: 0, assists: 3, cleanSheet: false, saves: 0, penaltySaves: 0, ownGoals: 0, cards: 0, teamWon: true },
        });
        expect(getPlayerBadges(candidate, [])).toContain('asistci');
    });

    test('returns duvar for GK with clean sheet', () => {
        const candidate = makeCandidate({
            position: 'GK',
            stats: { goals: 0, assists: 0, cleanSheet: true, saves: 0, penaltySaves: 0, ownGoals: 0, cards: 0, teamWon: true },
        });
        expect(getPlayerBadges(candidate, [])).toContain('duvar');
    });

    test('returns duvar for DF with clean sheet', () => {
        const candidate = makeCandidate({
            position: 'DF',
            stats: { goals: 0, assists: 0, cleanSheet: true, saves: 3, penaltySaves: 0, ownGoals: 0, cards: 0, teamWon: true },
        });
        expect(getPlayerBadges(candidate, [])).toContain('duvar');
    });

    test('returns duvar for GK with 5+ saves', () => {
        const candidate = makeCandidate({
            position: 'GK',
            stats: { goals: 0, assists: 0, cleanSheet: false, saves: 5, penaltySaves: 0, ownGoals: 0, cards: 0, teamWon: true },
        });
        expect(getPlayerBadges(candidate, [])).toContain('duvar');
    });

    test('returns mvp-yuksek for score >= 100', () => {
        const candidate = makeCandidate({ mvpScore: 100 });
        expect(getPlayerBadges(candidate, [])).toContain('mvp-yuksek');
    });

    test('multiple badges can be earned', () => {
        const candidate = makeCandidate({
            position: 'GK',
            mvpScore: 120,
            stats: { goals: 2, assists: 2, cleanSheet: true, saves: 6, penaltySaves: 1, ownGoals: 0, cards: 0, teamWon: true },
        });
        const badges = getPlayerBadges(candidate, []);
        expect(badges).toContain('gol-krali');
        expect(badges).toContain('asistci');
        expect(badges).toContain('duvar');
        expect(badges).toContain('mvp-yuksek');
    });
});
