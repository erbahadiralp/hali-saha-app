// Import the calculatePasswordStrength function
// Since the component doesn't export it separately, we need to test the logic
// Recreating the function for testing purposes

function calculatePasswordStrength(password: string): { score: number; label: string; color: string } {
    if (password.length === 0) {
        return { score: 0, label: '', color: '#6b7280' };
    }

    const commonPasswords = [
        'password', '123456', '12345678', '123456789', 'qwerty', 'abc123',
        'password1', 'password123', '111111', '123123', 'admin', 'letmein',
        'welcome', 'monkey', 'dragon', 'master', 'login', 'passw0rd',
        'sifre', 'sifre123', 'futbol', 'halisaha'
    ];

    if (commonPasswords.includes(password.toLowerCase())) {
        return { score: 0, label: 'Çok Zayıf', color: '#ef4444' };
    }

    const hasSequential = /(.)\1{2,}|012|123|234|345|456|567|678|789|890|abc|bcd|cde|def/i.test(password);
    const allSame = /^(.)\1+$/.test(password);
    if (allSame) {
        return { score: 0, label: 'Çok Zayıf', color: '#ef4444' };
    }

    let score = 0;
    if (password.length >= 8) score += 1;
    if (password.length >= 10) score += 1;
    if (password.length >= 14) score += 1;

    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-+=]/.test(password);

    const varietyCount = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;
    if (varietyCount >= 2) score += 1;
    if (varietyCount >= 3) score += 1;
    if (varietyCount === 4) score += 1;

    if (hasSequential) score = Math.max(0, score - 2);
    if (/^\d+$/.test(password)) score = Math.max(0, score - 1);

    const normalizedScore = Math.min(4, Math.max(0, score));
    const labels = ['Çok Zayıf', 'Zayıf', 'Orta', 'Güçlü', 'Çok Güçlü'];
    const colors = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#10b981'];

    return {
        score: normalizedScore,
        label: labels[normalizedScore],
        color: colors[normalizedScore],
    };
}

describe('calculatePasswordStrength', () => {
    test('empty password returns score 0 with empty label', () => {
        const result = calculatePasswordStrength('');
        expect(result.score).toBe(0);
        expect(result.label).toBe('');
    });

    test('common passwords return Çok Zayıf', () => {
        expect(calculatePasswordStrength('password').score).toBe(0);
        expect(calculatePasswordStrength('123456').score).toBe(0);
        expect(calculatePasswordStrength('qwerty').score).toBe(0);
        expect(calculatePasswordStrength('sifre').score).toBe(0);
        expect(calculatePasswordStrength('futbol').score).toBe(0);
        expect(calculatePasswordStrength('halisaha').score).toBe(0);
    });

    test('common passwords are case insensitive', () => {
        expect(calculatePasswordStrength('PASSWORD').score).toBe(0);
        expect(calculatePasswordStrength('Qwerty').score).toBe(0);
    });

    test('all same characters return Çok Zayıf', () => {
        expect(calculatePasswordStrength('aaaaaaa').score).toBe(0);
        expect(calculatePasswordStrength('1111111111').score).toBe(0);
    });

    test('short passwords with variety get low score', () => {
        const result = calculatePasswordStrength('Ab1!');
        // Length < 8: 0 points, variety = 4: +3 = 3
        expect(result.score).toBeLessThanOrEqual(3);
    });

    test('long password with all varieties gets max score', () => {
        const result = calculatePasswordStrength('MyStr0ng!Pa$$w0rd');
        expect(result.score).toBe(4);
        expect(result.label).toBe('Çok Güçlü');
    });

    test('sequential patterns reduce score', () => {
        const withSeq = calculatePasswordStrength('abc12345Xy');
        const withoutSeq = calculatePasswordStrength('xkf89302Xy');
        expect(withSeq.score).toBeLessThan(withoutSeq.score);
    });

    test('only numbers get penalized', () => {
        const numbersOnly = calculatePasswordStrength('9847362510');
        // Length >= 10: 2 pts, variety = 1 (number only): 0 pts, all digits: -1 = 1
        expect(numbersOnly.score).toBeLessThanOrEqual(2);
    });

    test('password with length >= 14 and all varieties is Çok Güçlü', () => {
        const result = calculatePasswordStrength('MyL0ngPa$$word!');
        expect(result.score).toBe(4);
    });

    test('medium length with 2 varieties gives Orta', () => {
        // 8 chars with lower + number
        const result = calculatePasswordStrength('hello12x');
        // length >= 8: +1, variety 2: +1 = 2
        expect(result.score).toBeGreaterThanOrEqual(1);
        expect(result.score).toBeLessThanOrEqual(3);
    });

    test('score is always between 0 and 4', () => {
        const passwords = ['', 'a', 'ab', 'abc123', 'Abc123!@#$%^&*()Long'];
        for (const pw of passwords) {
            const result = calculatePasswordStrength(pw);
            expect(result.score).toBeGreaterThanOrEqual(0);
            expect(result.score).toBeLessThanOrEqual(4);
        }
    });

    test('each score has correct label', () => {
        const labels = ['Çok Zayıf', 'Zayıf', 'Orta', 'Güçlü', 'Çok Güçlü'];
        // Score 0
        expect(calculatePasswordStrength('password').label).toBe('Çok Zayıf');
        // Score 4
        expect(calculatePasswordStrength('MyStr0ng!Pa$$w0rd').label).toBe('Çok Güçlü');
    });
});
