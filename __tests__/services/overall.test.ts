import {
    applyPositionPenalty,
    calculateActivityBonus,
    calculateActivityScore,
    calculateDisplayOverall,
    calculateFormBonus,
    // New system imports
    calculateGroupBase,
    calculateGroupMatchOverall,
    calculateMvpBonus,
    calculateOverall,
    calculateOverallFromStats,
    calculateSkillScore,
    calculateWinRateBonus,
    getDefaultArchetypeForPosition,
    mapLegacyArchetype,
    PlayerSkills
} from '../../services/overall';

// =====================================================
// LEGACY TESTS (kept for backward compatibility)
// =====================================================

describe('applyPositionPenalty', () => {
    test('no penalty when in position', () => {
        expect(applyPositionPenalty(80, false)).toBe(80);
    });

    test('applies 10% penalty when out of position', () => {
        expect(applyPositionPenalty(80, true)).toBe(72);
        expect(applyPositionPenalty(100, true)).toBe(90);
    });

    test('handles zero overall', () => {
        expect(applyPositionPenalty(0, true)).toBe(0);
        expect(applyPositionPenalty(0, false)).toBe(0);
    });

    test('rounds correctly', () => {
        expect(applyPositionPenalty(75, true)).toBe(68); // 75 * 0.9 = 67.5 -> 68
        expect(applyPositionPenalty(55, true)).toBe(50); // 55 * 0.9 = 49.5 -> 50
    });
});

describe('calculateActivityScore (legacy)', () => {
    test('returns 50 for null date', () => {
        expect(calculateActivityScore(null)).toBe(50);
    });

    test('returns 100 for recent match (within 30 days)', () => {
        const recentDate = new Date();
        recentDate.setDate(recentDate.getDate() - 10);
        expect(calculateActivityScore(recentDate)).toBe(100);
    });

    test('returns 100 for match exactly 30 days ago', () => {
        const date = new Date();
        date.setDate(date.getDate() - 30);
        expect(calculateActivityScore(date)).toBe(100);
    });

    test('decreases after 30 days', () => {
        const date = new Date();
        date.setDate(date.getDate() - 45);
        const score = calculateActivityScore(date);
        expect(score).toBeLessThan(100);
        expect(score).toBeGreaterThan(0);
    });

    test('returns 0 for very old date', () => {
        const oldDate = new Date();
        oldDate.setFullYear(oldDate.getFullYear() - 1);
        expect(calculateActivityScore(oldDate)).toBe(0);
    });

    test('returns 100 for today', () => {
        expect(calculateActivityScore(new Date())).toBe(100);
    });
});

describe('calculateOverall (legacy)', () => {
    test('calculates weighted average correctly', () => {
        // 40% skill + 40% performance + 20% activity
        expect(calculateOverall(80, 80, 80)).toBe(80);
        expect(calculateOverall(100, 100, 100)).toBe(100);
        expect(calculateOverall(0, 0, 0)).toBe(0);
    });

    test('weights are correct (40/40/20)', () => {
        expect(calculateOverall(100, 0, 0)).toBe(40);
        expect(calculateOverall(0, 100, 0)).toBe(40);
        expect(calculateOverall(0, 0, 100)).toBe(20);
    });

    test('rounds correctly', () => {
        expect(calculateOverall(50, 50, 50)).toBe(50);
    });
});

describe('calculateSkillScore', () => {
    test('calculates average of basic skills', () => {
        const skills: PlayerSkills = {
            speed: 80,
            shooting: 80,
            passing: 80,
            physical: 80,
            defense: 80,
        };
        expect(calculateSkillScore(skills)).toBe(80);
    });

    test('includes GK skills when present', () => {
        const skills: PlayerSkills = {
            speed: 60,
            shooting: 60,
            passing: 60,
            physical: 60,
            defense: 60,
            reflexes: 90,
            diving: 90,
        };
        const score = calculateSkillScore(skills);
        expect(score).toBeCloseTo(480 / 7, 1);
    });

    test('handles all zeros', () => {
        const skills: PlayerSkills = {
            speed: 0,
            shooting: 0,
            passing: 0,
            physical: 0,
            defense: 0,
        };
        expect(calculateSkillScore(skills)).toBe(0);
    });
});

describe('calculateOverallFromStats (legacy fallback)', () => {
    test('returns 50 for null stats', () => {
        expect(calculateOverallFromStats(null)).toBe(50);
    });

    test('returns 50 for undefined stats', () => {
        expect(calculateOverallFromStats(undefined)).toBe(50);
    });

    test('returns 50 for zero matchCount', () => {
        expect(calculateOverallFromStats({ matchCount: 0, goals: 5 })).toBe(50);
    });

    test('never returns above 99', () => {
        const stats = {
            goals: 1000,
            assists: 1000,
            matchCount: 1,
            wins: 1,
            motmCount: 100,
        };
        const result = calculateOverallFromStats(stats);
        expect(result).toBeLessThanOrEqual(99);
    });

    test('uses new system when groupBases provided', () => {
        const stats = {
            goals: 10,
            assists: 5,
            matchCount: 10,
            wins: 7,
            motmCount: 3,
            groupBases: [77, 70, 75],
            formScores: [8, 9, 8, 9, 8, 8, 9, 8, 9, 8],
            daysSinceLastMatch: 5,
        };
        const result = calculateOverallFromStats(stats);
        expect(result).toBeGreaterThanOrEqual(40);
        expect(result).toBeLessThanOrEqual(99);
        // With group bases avg ~74 and good form, should be higher than old system's 45-55
        expect(result).toBeGreaterThan(70);
    });
});

describe('mapLegacyArchetype', () => {
    test('maps known legacy archetypes correctly', () => {
        expect(mapLegacyArchetype('finisher', 'FW')).toBe('fw-finisher');
        expect(mapLegacyArchetype('speedster', 'FW')).toBe('fw-speedster');
        expect(mapLegacyArchetype('wall', 'DF')).toBe('df-wall');
        expect(mapLegacyArchetype('goalkeeper', 'GK')).toBe('gk-reflex');
    });

    test('returns default for unknown archetype', () => {
        const result = mapLegacyArchetype('unknown_archetype', 'FW');
        expect(result).toBe(getDefaultArchetypeForPosition('FW'));
    });

    test('maps cross-position correctly', () => {
        expect(mapLegacyArchetype('finisher', 'MF')).toBe('mf-shadow-striker');
    });
});

// =====================================================
// NEW OVERALL SYSTEM TESTS
// =====================================================

describe('calculateGroupBase', () => {
    test('skill 1 = 46', () => {
        expect(calculateGroupBase(1)).toBe(46);
    });

    test('skill 5 = 70 (average)', () => {
        expect(calculateGroupBase(5)).toBe(70);
    });

    test('skill 8 = 88', () => {
        expect(calculateGroupBase(8)).toBe(88);
    });

    test('skill 10 = 100', () => {
        expect(calculateGroupBase(10)).toBe(100);
    });

    test('clamps below 1', () => {
        expect(calculateGroupBase(0)).toBe(46); // clamped to 1
        expect(calculateGroupBase(-5)).toBe(46);
    });

    test('clamps above 10', () => {
        expect(calculateGroupBase(11)).toBe(100); // clamped to 10
        expect(calculateGroupBase(99)).toBe(100);
    });

    test('skill level table is correct', () => {
        expect(calculateGroupBase(1)).toBe(46);
        expect(calculateGroupBase(2)).toBe(52);
        expect(calculateGroupBase(3)).toBe(58);
        expect(calculateGroupBase(4)).toBe(64);
        expect(calculateGroupBase(5)).toBe(70);
        expect(calculateGroupBase(6)).toBe(76);
        expect(calculateGroupBase(7)).toBe(82);
        expect(calculateGroupBase(8)).toBe(88);
        expect(calculateGroupBase(9)).toBe(94);
        expect(calculateGroupBase(10)).toBe(100);
    });
});

describe('calculateFormBonus', () => {
    test('returns 0 for empty array', () => {
        expect(calculateFormBonus([])).toBe(0);
    });

    test('returns 0 for average 5.0 (neutral)', () => {
        expect(calculateFormBonus([5, 5, 5, 5, 5])).toBe(0);
    });

    test('returns +10 for average 10.0 (max)', () => {
        expect(calculateFormBonus([10, 10, 10, 10, 10])).toBe(10);
    });

    test('returns -10 for average 0.0 (min)', () => {
        expect(calculateFormBonus([0, 0, 0, 0, 0])).toBe(-10);
    });

    test('returns +5 for average 7.5', () => {
        expect(calculateFormBonus([7.5, 7.5, 7.5, 7.5])).toBe(5);
    });

    test('returns -5 for average 2.5', () => {
        expect(calculateFormBonus([2.5, 2.5, 2.5, 2.5])).toBe(-5);
    });

    test('handles doc example: avg 8.9 → +8', () => {
        const scores = [10.0, 8.5, 9.0, 7.0, 10.0, 8.0, 9.5, 8.0, 9.0, 10.0];
        expect(calculateFormBonus(scores)).toBe(8);
    });
});

describe('calculateActivityBonus', () => {
    test('returns 0 for null (new player)', () => {
        expect(calculateActivityBonus(null)).toBe(0);
    });

    test('returns +3 for ≤7 days', () => {
        expect(calculateActivityBonus(0)).toBe(3);
        expect(calculateActivityBonus(3)).toBe(3);
        expect(calculateActivityBonus(7)).toBe(3);
    });

    test('returns +2 for ≤14 days', () => {
        expect(calculateActivityBonus(8)).toBe(2);
        expect(calculateActivityBonus(10)).toBe(2);
        expect(calculateActivityBonus(14)).toBe(2);
    });

    test('returns 0 for ≤30 days (neutral)', () => {
        expect(calculateActivityBonus(15)).toBe(0);
        expect(calculateActivityBonus(25)).toBe(0);
        expect(calculateActivityBonus(30)).toBe(0);
    });

    test('returns -2 for ≤60 days', () => {
        expect(calculateActivityBonus(31)).toBe(-2);
        expect(calculateActivityBonus(45)).toBe(-2);
        expect(calculateActivityBonus(60)).toBe(-2);
    });

    test('returns -3 for >60 days', () => {
        expect(calculateActivityBonus(61)).toBe(-3);
        expect(calculateActivityBonus(90)).toBe(-3);
        expect(calculateActivityBonus(365)).toBe(-3);
    });
});

describe('calculateMvpBonus', () => {
    test('returns 0 for 0 MVPs', () => {
        expect(calculateMvpBonus(0)).toBe(0);
    });

    test('returns correct values for small counts', () => {
        expect(calculateMvpBonus(1)).toBe(0); // 0.3 rounds to 0
        expect(calculateMvpBonus(2)).toBe(1); // 0.6 rounds to 1
        expect(calculateMvpBonus(3)).toBe(1); // 0.9 rounds to 1
        expect(calculateMvpBonus(5)).toBe(2); // 1.5 rounds to 2
    });

    test('caps at 2', () => {
        expect(calculateMvpBonus(7)).toBe(2);
        expect(calculateMvpBonus(15)).toBe(2);
        expect(calculateMvpBonus(100)).toBe(2);
    });
});

describe('calculateWinRateBonus', () => {
    test('returns 0 for 50% win rate (neutral)', () => {
        expect(calculateWinRateBonus(0.5)).toBe(0);
    });

    test('positive bonus for above 50%', () => {
        expect(calculateWinRateBonus(0.6)).toBe(1);  // 0.6 rounds to 1
        expect(calculateWinRateBonus(0.7)).toBe(1);  // 1.2 rounds to 1
        expect(calculateWinRateBonus(0.8)).toBe(2);  // 1.8 rounds to 2
    });

    test('negative bonus for below 50%', () => {
        expect(calculateWinRateBonus(0.4)).toBe(-1); // -0.6 rounds to -1
        expect(calculateWinRateBonus(0.2)).toBe(-2); // -1.8 rounds to -2
    });

    test('caps at +3', () => {
        expect(calculateWinRateBonus(1.0)).toBe(3);
    });

    test('caps at -3', () => {
        expect(calculateWinRateBonus(0.0)).toBe(-3);
    });
});

describe('calculateDisplayOverall', () => {
    test('Test 1: Yeni Oyuncu (grupsuuz)', () => {
        const result = calculateDisplayOverall({
            groupBases: [],
            formScores: [],
            daysSinceLastMatch: null,
            mvpCount: 0,
            winRate: 0,
        });
        expect(result.averageBase).toBe(65);
        expect(result.formBonus).toBe(0);
        expect(result.activityBonus).toBe(0);
        expect(result.mvpBonus).toBe(0);
        // winRate 0 → (0-0.5)*6 = -3
        expect(result.total).toBe(62); // 65 + 0 + 0 + 0 + (-3)
    });

    test('Test 2: Tek Grup, İyi Form', () => {
        const result = calculateDisplayOverall({
            groupBases: [70],
            formScores: [8, 9, 8, 9, 8, 8, 9, 8, 9, 8], // avg 8.4
            daysSinceLastMatch: 5,
            mvpCount: 2,
            winRate: 0.7,
        });
        expect(result.averageBase).toBe(70);
        expect(result.formBonus).toBe(7);       // (8.4-5)*2 = 6.8 → 7
        expect(result.activityBonus).toBe(3);   // 5 days
        expect(result.mvpBonus).toBe(1);        // 2*0.3 = 0.6 → 1
        expect(result.winRateBonus).toBe(1);    // (0.7-0.5)*6 = 1.2 → 1
        expect(result.total).toBe(82);          // 70+7+3+1+1 = 82
    });

    test('Test 3: Çoklu Grup, Mükemmel Performans', () => {
        const result = calculateDisplayOverall({
            groupBases: [77, 70, 75], // avg 74
            formScores: [10, 10, 9, 10, 10, 9, 10, 10, 9, 10], // avg 9.7
            daysSinceLastMatch: 1,
            mvpCount: 5,
            winRate: 0.9,
        });
        expect(result.averageBase).toBe(74);
        expect(result.formBonus).toBe(9);        // (9.7-5)*2 = 9.4 → 9
        expect(result.activityBonus).toBe(3);    // 1 day
        expect(result.mvpBonus).toBe(2);         // 5*0.3 = 1.5 → 2
        expect(result.winRateBonus).toBe(2);     // (0.9-0.5)*6 = 2.4 → 2
        expect(result.total).toBe(90);           // 74+9+3+2+2 = 90
    });

    test('Test 4: Elite Oyuncu (caps at 99)', () => {
        const result = calculateDisplayOverall({
            groupBases: [88, 85, 90, 87], // avg 87.5 → 88
            formScores: [9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5, 9.5], // avg 9.5
            daysSinceLastMatch: 1,
            mvpCount: 15,
            winRate: 0.92,
        });
        expect(result.averageBase).toBe(88);
        expect(result.formBonus).toBe(9);        // (9.5-5)*2 = 9 → 9
        expect(result.activityBonus).toBe(3);
        expect(result.mvpBonus).toBe(2);         // capped
        expect(result.winRateBonus).toBe(3);     // (0.92-0.5)*6 = 2.52 → 3
        // 88+9+3+2+3 = 105 → capped at 99
        expect(result.total).toBe(99);
    });

    test('Test 5: Pasif Oyuncu', () => {
        const result = calculateDisplayOverall({
            groupBases: [70],
            formScores: [6, 5, 6, 5, 6, 5, 6, 5, 6, 5], // avg 5.5
            daysSinceLastMatch: 70,
            mvpCount: 0,
            winRate: 0.4,
        });
        expect(result.averageBase).toBe(70);
        expect(result.formBonus).toBe(1);        // (5.5-5)*2 = 1
        expect(result.activityBonus).toBe(-3);   // 70 days > 60
        expect(result.mvpBonus).toBe(0);
        expect(result.winRateBonus).toBe(-1);    // (0.4-0.5)*6 = -0.6 → -1
        expect(result.total).toBe(67);           // 70+1-3+0-1 = 67
    });

    test('Minimum cap at 40', () => {
        const result = calculateDisplayOverall({
            groupBases: [46], // skill 1
            formScores: [0, 0, 0, 0, 0], // worst form
            daysSinceLastMatch: 365,
            mvpCount: 0,
            winRate: 0,
        });
        // 46 + (-10) + (-3) + 0 + (-3) = 30 → capped at 40
        expect(result.total).toBe(40);
    });

    test('Senin Durumun (from doc)', () => {
        const result = calculateDisplayOverall({
            groupBases: [77, 70, 75], // avg 74
            formScores: [10.0, 8.5, 9.0, 7.0, 10.0, 8.0, 9.5, 8.0, 9.0, 10.0], // avg 8.9
            daysSinceLastMatch: 3,
            mvpCount: 4,
            winRate: 0.85,
        });
        expect(result.averageBase).toBe(74);
        expect(result.formBonus).toBe(8);
        expect(result.activityBonus).toBe(3);
        expect(result.mvpBonus).toBe(1);
        expect(result.winRateBonus).toBe(2);
        expect(result.total).toBe(88);
    });
});

describe('calculateGroupMatchOverall', () => {
    test('returns base when no form scores', () => {
        expect(calculateGroupMatchOverall(77, [])).toBe(77);
    });

    test('adds form bonus correctly', () => {
        // From doc: base 77, form avg 9.4 → bonus (9.4-5)*1.5 = +6.6 → +7
        const result = calculateGroupMatchOverall(77, [10.0, 9.0, 10.0, 8.0, 10.0]);
        expect(result).toBe(84); // 77 + 7 = 84
    });

    test('subtracts for bad form', () => {
        // avg 3.0 → (3-5)*1.5 = -3
        const result = calculateGroupMatchOverall(70, [3, 3, 3, 3, 3]);
        expect(result).toBe(67); // 70 - 3 = 67
    });

    test('neutral for average form', () => {
        // avg 5.0 → (5-5)*1.5 = 0
        const result = calculateGroupMatchOverall(70, [5, 5, 5, 5, 5]);
        expect(result).toBe(70);
    });

    test('clamps to 40 minimum', () => {
        const result = calculateGroupMatchOverall(46, [0, 0, 0, 0, 0]);
        // 46 + (0-5)*1.5 = 46 - 8 = 38 → clamped to 40
        expect(result).toBe(40);
    });

    test('clamps to 99 maximum', () => {
        const result = calculateGroupMatchOverall(100, [10, 10, 10, 10, 10]);
        // 100 + (10-5)*1.5 = 100 + 8 = 108 → clamped to 99
        expect(result).toBe(99);
    });
});
