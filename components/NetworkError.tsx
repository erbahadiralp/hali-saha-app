import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { borderRadius, colors, spacing } from '../constants/designTokens';

interface NetworkErrorProps {
    message?: string;
    onRetry: () => void;
    isDark?: boolean;
}

/**
 * Network error state with retry button
 */
export default function NetworkError({
    message = 'Bağlantı hatası oluştu',
    onRetry,
    isDark = true,
}: NetworkErrorProps) {
    return (
        <View style={[styles.container, { backgroundColor: isDark ? '#0a0a0a' : '#f8fafc' }]}>
            <View style={[styles.iconContainer, { backgroundColor: isDark ? '#1f2937' : '#fee2e2' }]}>
                <MaterialIcons
                    name="wifi-off"
                    size={48}
                    color={colors.error}
                />
            </View>

            <Text style={[styles.title, { color: isDark ? colors.textDark : colors.textLight }]}>
                Bağlantı Hatası
            </Text>

            <Text style={[styles.message, { color: isDark ? colors.textSecondaryDark : colors.textSecondaryLight }]}>
                {message}
            </Text>

            <TouchableOpacity
                onPress={onRetry}
                style={styles.retryButton}
                activeOpacity={0.7}
            >
                <MaterialIcons name="refresh" size={20} color="#0a0a0a" />
                <Text style={styles.retryText}>Tekrar Dene</Text>
            </TouchableOpacity>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: spacing.xxl,
    },
    iconContainer: {
        width: 96,
        height: 96,
        borderRadius: 48,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: spacing.xl,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: spacing.sm,
    },
    message: {
        fontSize: 14,
        textAlign: 'center',
        marginBottom: spacing.xxl,
    },
    retryButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.primary,
        paddingVertical: spacing.md,
        paddingHorizontal: spacing.xl,
        borderRadius: borderRadius.md,
        gap: spacing.sm,
    },
    retryText: {
        fontSize: 16,
        fontWeight: '600',
        color: '#0a0a0a',
    },
});
