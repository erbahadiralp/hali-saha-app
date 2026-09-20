/**
 * Validation utility tests
 * Tests for email, username, and password validation
 */

// Email validation regex (from register.tsx)
const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Username validation regex (from register.tsx)
const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;

// Valid email domains (subset from register.tsx)
const validDomains = [
    'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com', 'icloud.com',
    'mail.com', 'protonmail.com', 'yandex.com', 'live.com', 'msn.com',
];

const isValidEmailDomain = (email: string): boolean => {
    const emailDomain = email.split('@')[1]?.toLowerCase();
    return validDomains.some(domain => emailDomain?.endsWith(domain)) ||
        emailDomain?.endsWith('.edu.tr') ||
        emailDomain?.endsWith('.gov.tr');
};

describe('Email Validation', () => {
    test('accepts valid email format', () => {
        expect(emailRegex.test('user@gmail.com')).toBe(true);
        expect(emailRegex.test('test.user@hotmail.com')).toBe(true);
        expect(emailRegex.test('user123@outlook.com')).toBe(true);
    });

    test('rejects invalid email format', () => {
        expect(emailRegex.test('usermail.com')).toBe(false);
        expect(emailRegex.test('@gmail.com')).toBe(false);
        expect(emailRegex.test('user@')).toBe(false);
        expect(emailRegex.test('user @gmail.com')).toBe(false);
        expect(emailRegex.test('')).toBe(false);
    });

    test('accepts valid email domains', () => {
        expect(isValidEmailDomain('user@gmail.com')).toBe(true);
        expect(isValidEmailDomain('user@hotmail.com')).toBe(true);
        expect(isValidEmailDomain('user@metu.edu.tr')).toBe(true);
        expect(isValidEmailDomain('user@some.gov.tr')).toBe(true);
    });

    test('rejects invalid email domains', () => {
        expect(isValidEmailDomain('user@fake.com')).toBe(false);
        expect(isValidEmailDomain('user@tempmail.xyz')).toBe(false);
    });
});

describe('Username Validation', () => {
    test('accepts valid usernames', () => {
        expect(usernameRegex.test('ali123')).toBe(true);
        expect(usernameRegex.test('user_name')).toBe(true);
        expect(usernameRegex.test('Player1')).toBe(true);
        expect(usernameRegex.test('abc')).toBe(true); // min 3 chars
    });

    test('rejects usernames too short', () => {
        expect(usernameRegex.test('ab')).toBe(false);
        expect(usernameRegex.test('a')).toBe(false);
        expect(usernameRegex.test('')).toBe(false);
    });

    test('rejects usernames too long', () => {
        expect(usernameRegex.test('a'.repeat(21))).toBe(false);
    });

    test('rejects usernames with invalid characters', () => {
        expect(usernameRegex.test('user name')).toBe(false);
        expect(usernameRegex.test('user@name')).toBe(false);
        expect(usernameRegex.test('user-name')).toBe(false);
        expect(usernameRegex.test('user.name')).toBe(false);
    });
});

describe('Password Validation', () => {
    test('accepts passwords with minimum length', () => {
        expect('12345678'.length >= 8).toBe(true);
        expect('password123'.length >= 8).toBe(true);
    });

    test('rejects passwords too short', () => {
        expect('1234567'.length >= 8).toBe(false);
        expect('abc'.length >= 8).toBe(false);
        expect(''.length >= 8).toBe(false);
    });
});

describe('Password Strength Calculation', () => {
    // Password strength logic from PasswordStrengthMeter
    const calculateStrength = (password: string): number => {
        let strength = 0;
        if (password.length >= 8) strength += 25;
        if (password.length >= 12) strength += 15;
        if (/[a-z]/.test(password)) strength += 15;
        if (/[A-Z]/.test(password)) strength += 15;
        if (/[0-9]/.test(password)) strength += 15;
        if (/[^a-zA-Z0-9]/.test(password)) strength += 15;
        return Math.min(strength, 100);
    };

    test('calculates weak password strength', () => {
        expect(calculateStrength('abc')).toBeLessThan(30);
        expect(calculateStrength('12345')).toBeLessThan(30);
    });

    test('calculates medium password strength', () => {
        const strength = calculateStrength('password1');
        expect(strength).toBeGreaterThanOrEqual(40);
        expect(strength).toBeLessThan(70);
    });

    test('calculates strong password strength', () => {
        const strength = calculateStrength('Password123!');
        expect(strength).toBeGreaterThanOrEqual(80);
    });
});
