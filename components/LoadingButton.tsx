import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, ViewStyle } from 'react-native';
import { borderRadius, colors, spacing, touchTargets } from '../constants/designTokens';
import { lightHaptic, mediumHaptic } from '../services/haptics';

interface LoadingButtonProps {
    title: string;
    onPress: () => void | Promise<void>;
    loading?: boolean;
    disabled?: boolean;
    variant?: 'primary' | 'secondary' | 'danger' | 'glass';
    isDark?: boolean;
    style?: ViewStyle;
    icon?: React.ReactNode;
}

/**
 * Button with loading state and haptic feedback
 */
export default function LoadingButton({
    title,
    onPress,
    loading = false,
    disabled = false,
    variant = 'primary',
    isDark = true,
    style,
    icon,
}: LoadingButtonProps) {
    const handlePress = async () => {
        if (loading || disabled) return;

        // Trigger haptic feedback
        if (variant === 'primary') {
            mediumHaptic();
        } else {
            lightHaptic();
        }

        await onPress();
    };

    const getBackgroundColor = () => {
        if (disabled) return isDark ? '#374151' : '#d1d5db';
        switch (variant) {
            case 'primary':
                return colors.primary;
            case 'secondary':
                return isDark ? colors.cardDark : colors.cardLight;
            case 'danger':
                return colors.error;
            case 'glass':
                return 'rgba(16, 185, 129, 0.15)';
            default:
                return colors.primary;
        }
    };

    const getTextColor = () => {
        if (variant === 'primary' || variant === 'danger') {
            return '#0a0a0a';
        }
        if (variant === 'glass') {
            return '#10B981';
        }
        return isDark ? colors.textDark : colors.textLight;
    };

    return (
        <TouchableOpacity
            onPress={handlePress}
            disabled={loading || disabled}
            activeOpacity={0.7}
            style={[
                styles.button,
                {
                    backgroundColor: getBackgroundColor(),
                    opacity: disabled ? 0.5 : 1,
                    borderWidth: variant === 'secondary' || variant === 'glass' ? 1.5 : 0,
                    borderColor: variant === 'glass' ? 'rgba(16, 185, 129, 0.4)' : (isDark ? colors.borderDark : colors.borderLight),
                },
                style,
            ]}
        >
            {loading ? (
                <ActivityIndicator
                    size="small"
                    color={variant === 'secondary' || variant === 'glass' ? '#10B981' : '#0a0a0a'}
                />
            ) : (
                <>
                    {icon}
                    <Text style={[styles.text, { color: getTextColor(), marginLeft: icon ? spacing.sm : 0 }]}>
                        {title}
                    </Text>
                </>
            )}
        </TouchableOpacity>
    );
}

const styles = StyleSheet.create({
    button: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: borderRadius.md,
        paddingVertical: spacing.lg,
        paddingHorizontal: spacing.xl,
        minHeight: touchTargets.minimum,
    },
    text: {
        fontSize: 16,
        fontWeight: '600',
    },
});
