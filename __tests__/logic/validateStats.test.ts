// Extract the validateStats logic for testing
const validateStats = (scoreA: number, scoreB: number, myTeam: string | null, myGoals: number, myAssists: number) => {
    const errors: string[] = [];
    const warnings: string[] = [];

    const myTeamScore = myTeam === 'A' ? scoreA : myTeam === 'B' ? scoreB : Math.max(scoreA, scoreB);

    if (myGoals > myTeamScore) {
        errors.push(`Attığın gol sayısı (${myGoals}) takımının toplam golünden (${myTeamScore}) fazla olamaz.`);
    }

    if (myAssists > myTeamScore) {
        errors.push(`Asist sayısı (${myAssists}) takımının toplam golünden (${myTeamScore}) fazla olamaz.`);
    }

    if (myGoals + myAssists > myTeamScore) {
        errors.push(`Toplam katkın (Gol + Asist: ${myGoals + myAssists}) takımının skorundan (${myTeamScore}) fazla olamaz.`);
    }

    return { errors, warnings, isValid: errors.length === 0 };
};

describe('validateStats', () => {
    describe('valid cases', () => {
        test('zero goals and assists is always valid', () => {
            const result = validateStats(3, 2, 'A', 0, 0);
            expect(result.isValid).toBe(true);
            expect(result.errors).toHaveLength(0);
        });

        test('goals equal to team score is valid', () => {
            const result = validateStats(3, 2, 'A', 3, 0);
            expect(result.isValid).toBe(true);
        });

        test('assists equal to team score is valid', () => {
            const result = validateStats(3, 2, 'A', 0, 3);
            expect(result.isValid).toBe(true);
        });

        test('goals + assists equal to team score is valid', () => {
            const result = validateStats(5, 2, 'A', 2, 3);
            expect(result.isValid).toBe(true);
        });

        test('single goal single assist for team with 2 goals', () => {
            const result = validateStats(2, 1, 'A', 1, 1);
            expect(result.isValid).toBe(true);
        });
    });

    describe('team selection', () => {
        test('uses scoreA when myTeam is A', () => {
            const result = validateStats(3, 5, 'A', 4, 0);
            // Team A score is 3, goals = 4 > 3 -> error
            expect(result.isValid).toBe(false);
        });

        test('uses scoreB when myTeam is B', () => {
            const result = validateStats(5, 2, 'B', 3, 0);
            // Team B score is 2, goals = 3 > 2 -> error
            expect(result.isValid).toBe(false);
        });

        test('uses max score when myTeam is null', () => {
            const result = validateStats(3, 5, null, 4, 0);
            // Max score is 5, goals = 4 <= 5 -> valid
            expect(result.isValid).toBe(true);
        });
    });

    describe('invalid cases', () => {
        test('goals exceed team score', () => {
            const result = validateStats(2, 1, 'A', 3, 0);
            expect(result.isValid).toBe(false);
            expect(result.errors.length).toBeGreaterThan(0);
        });

        test('assists exceed team score', () => {
            const result = validateStats(2, 1, 'A', 0, 3);
            expect(result.isValid).toBe(false);
        });

        test('goals + assists exceed team score', () => {
            const result = validateStats(3, 1, 'A', 2, 2);
            // 2+2=4 > 3 -> error
            expect(result.isValid).toBe(false);
        });

        test('multiple errors for severely invalid stats', () => {
            const result = validateStats(1, 0, 'A', 5, 5);
            // goals(5) > teamScore(1), assists(5) > teamScore(1), total(10) > teamScore(1)
            expect(result.errors.length).toBe(3);
        });
    });

    describe('edge cases', () => {
        test('0-0 match with zero stats is valid', () => {
            const result = validateStats(0, 0, 'A', 0, 0);
            expect(result.isValid).toBe(true);
        });

        test('0-0 match with any goals is invalid', () => {
            const result = validateStats(0, 0, 'A', 1, 0);
            expect(result.isValid).toBe(false);
        });

        test('high scoring match allows more stats', () => {
            const result = validateStats(10, 8, 'A', 5, 4);
            // 5+4=9 ≤ 10 -> valid
            expect(result.isValid).toBe(true);
        });

        test('high scoring match rejects overcount', () => {
            const result = validateStats(10, 8, 'A', 6, 5);
            // 6+5=11 > 10 -> invalid
            expect(result.isValid).toBe(false);
        });
    });
});
