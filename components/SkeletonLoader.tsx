import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, useColorScheme } from 'react-native';

interface SkeletonLoaderProps {
    width?: number | string;
    height?: number;
    borderRadius?: number;
    style?: object;
}

/**
 * Shimmer skeleton loading component
 */
export function SkeletonLoader({
    width = '100%',
    height = 20,
    borderRadius = 8,
    style = {},
}: SkeletonLoaderProps) {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const shimmerAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const animation = Animated.loop(
            Animated.sequence([
                Animated.timing(shimmerAnim, {
                    toValue: 1,
                    duration: 1000,
                    useNativeDriver: true,
                }),
                Animated.timing(shimmerAnim, {
                    toValue: 0,
                    duration: 1000,
                    useNativeDriver: true,
                }),
            ])
        );
        animation.start();
        return () => animation.stop();
    }, []);

    const opacity = shimmerAnim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.3, 0.7],
    });

    return (
        <Animated.View
            style={[
                {
                    width: width as any,
                    height,
                    borderRadius,
                    backgroundColor: isDark ? '#374151' : '#E5E7EB',
                    opacity,
                },
                style,
            ]}
        />
    );
}

/**
 * Match card skeleton for loading states
 */
export function MatchCardSkeleton() {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    return (
        <View
            style={[
                styles.matchCard,
                { backgroundColor: isDark ? '#1f2937' : '#ffffff' },
            ]}
        >
            <View style={styles.matchCardHeader}>
                <SkeletonLoader width={120} height={16} />
                <SkeletonLoader width={60} height={16} />
            </View>
            <View style={styles.matchCardBody}>
                <SkeletonLoader width={80} height={12} />
                <SkeletonLoader width={100} height={12} />
            </View>
            <View style={styles.matchCardFooter}>
                <SkeletonLoader width="30%" height={32} borderRadius={16} />
                <SkeletonLoader width={60} height={14} />
            </View>
        </View>
    );
}

/**
 * Group card skeleton for loading states
 */
export function GroupCardSkeleton() {
    return (
        <View style={styles.groupCard}>
            <SkeletonLoader width={64} height={64} borderRadius={32} />
            <SkeletonLoader width={50} height={12} style={{ marginTop: 8 }} />
        </View>
    );
}

/**
 * Player card skeleton for loading states
 */
export function PlayerCardSkeleton() {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    return (
        <View
            style={[
                styles.playerCard,
                { backgroundColor: isDark ? '#1f2937' : '#ffffff' },
            ]}
        >
            <SkeletonLoader width={48} height={48} borderRadius={24} />
            <View style={{ flex: 1, marginLeft: 12, gap: 8 }}>
                <SkeletonLoader width={100} height={16} />
                <SkeletonLoader width={60} height={12} />
            </View>
            <SkeletonLoader width={36} height={36} borderRadius={18} />
        </View>
    );
}

/**
 * Profile FIFA card skeleton
 */
export function ProfileCardSkeleton() {
    return (
        <View style={styles.profileCard}>
            <SkeletonLoader width="100%" height={160} borderRadius={12} />
        </View>
    );
}

/**
 * Stats row skeleton
 */
export function StatsRowSkeleton() {
    return (
        <View style={styles.statsRow}>
            {[1, 2, 3, 4].map((i) => (
                <View key={i} style={styles.statItem}>
                    <SkeletonLoader width={40} height={24} />
                    <SkeletonLoader width={50} height={12} style={{ marginTop: 4 }} />
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    matchCard: {
        padding: 16,
        borderRadius: 16,
        marginBottom: 12,
        gap: 12,
    },
    matchCardHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    matchCardBody: {
        gap: 8,
    },
    matchCardFooter: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginTop: 8,
    },
    groupCard: {
        alignItems: 'center',
        gap: 8,
        marginRight: 16,
    },
    playerCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 12,
        borderRadius: 12,
        marginBottom: 8,
    },
    profileCard: {
        marginBottom: 16,
    },
    statsRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        paddingVertical: 16,
    },
    statItem: {
        alignItems: 'center',
        gap: 4,
    },
});
