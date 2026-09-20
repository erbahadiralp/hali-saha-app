import React, { useMemo } from 'react';
import { StyleSheet, Text, View, useColorScheme } from 'react-native';
import { getThemeColors, palette } from '../constants/designTokens';

interface PasswordStrengthMeterProps {
    password: string;
}

type StrengthTone = 'error' | 'warning' | 'success';

interface StrengthResult {
    score: number; // 0-4
    label: string;
    tone: StrengthTone;
}

function calculatePasswordStrength(password: string): StrengthResult {
    if (password.length === 0) {
        return { score: 0, label: '', tone: 'error' };
    }

    // Common weak passwords list
    const commonPasswords = [
        'password', '123456', '12345678', '123456789', 'qwerty', 'abc123',
        'password1', 'password123', '111111', '123123', 'admin', 'letmein',
        'welcome', 'monkey', 'dragon', 'master', 'login', 'passw0rd',
        'sifre', 'sifre123', 'futbol', 'halisaha'
    ];

    // Check for common weak passwords
    if (commonPasswords.includes(password.toLowerCase())) {
        return { score: 0, label: 'Çok Zayıf', tone: 'error' };
    }

    // Check for sequential patterns (123456, abcdef, etc.)
    const hasSequential = /(.)\1{2,}|012|123|234|345|456|567|678|789|890|abc|bcd|cde|def/i.test(password);

    // Check for all same characters
    const allSame = /^(.)\1+$/.test(password);
    if (allSame) {
        return { score: 0, label: 'Çok Zayıf', tone: 'error' };
    }

    let score = 0;

    // Length checks (more strict)
    if (password.length >= 8) score += 1;
    if (password.length >= 10) score += 1;
    if (password.length >= 14) score += 1;

    // Character variety checks (must have variety)
    const hasLower = /[a-z]/.test(password);
    const hasUpper = /[A-Z]/.test(password);
    const hasNumber = /\d/.test(password);
    const hasSpecial = /[!@#$%^&*(),.?":{}|<>_\-+=]/.test(password);

    // At least 2 different character types
    const varietyCount = [hasLower, hasUpper, hasNumber, hasSpecial].filter(Boolean).length;

    if (varietyCount >= 2) score += 1;
    if (varietyCount >= 3) score += 1;
    if (varietyCount === 4) score += 1;

    // Penalize sequential patterns
    if (hasSequential) score = Math.max(0, score - 2);

    // Penalize if only numbers
    if (/^\d+$/.test(password)) score = Math.max(0, score - 1);

    // Normalize to 0-4
    const normalizedScore = Math.min(4, Math.max(0, score));

    const labels = ['Çok Zayıf', 'Zayıf', 'Orta', 'Güçlü', 'Çok Güçlü'];
    const tones: StrengthTone[] = ['error', 'error', 'warning', 'success', 'success'];

    return {
        score: normalizedScore,
        label: labels[normalizedScore],
        tone: tones[normalizedScore],
    };
}

export default function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
    const isDark = useColorScheme() === 'dark';
    const T = getThemeColors(isDark);

    const strength = useMemo(() => calculatePasswordStrength(password), [password]);

    if (password.length === 0) return null;

    const barColor = strength.tone === 'success' ? T.primary : T[strength.tone];
    const labelColor = strength.tone === 'success'
        ? (isDark ? palette.greenBright : palette.greenText)
        : T[strength.tone];
    const emptyBar = isDark ? palette.darkSegment : T.divider;

    return (
        <View style={styles.container}>
            <View style={styles.barsContainer}>
                {[0, 1, 2, 3].map((index) => (
                    <View
                        key={index}
                        style={[styles.bar, { backgroundColor: index <= strength.score ? barColor : emptyBar }]}
                    />
                ))}
            </View>
            <Text style={[styles.label, { color: labelColor }]}>
                {strength.label}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flexDirection: 'row',
        alignItems: 'center',
        marginTop: 8,
        gap: 8,
    },
    barsContainer: {
        flexDirection: 'row',
        flex: 1,
        gap: 4,
    },
    bar: {
        flex: 1,
        height: 4,
        borderRadius: 2,
    },
    label: {
        fontSize: 11,
        fontWeight: '600',
        minWidth: 56,
        textAlign: 'right',
    },
});
