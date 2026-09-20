import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Text, View, useColorScheme } from 'react-native';

interface MatchPerformance {
    matchId: string;
    date: Date;
    goals: number;
    assists: number;
    rating: number; // 1-10 rating or calculated
    won: boolean;
}

interface FormGraphProps {
    performances: MatchPerformance[];
    maxMatches?: number;
}

/**
 * Form Graph - Shows performance trend for last N matches
 * Oyuncu Pro feature
 */
export function FormGraph({ performances, maxMatches = 10 }: FormGraphProps) {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    const data = performances.slice(0, maxMatches).reverse(); // oldest first for left-to-right

    if (data.length === 0) {
        return (
            <View style={{
                padding: 16,
                borderRadius: 16,
                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f9fafb',
                alignItems: 'center',
                justifyContent: 'center',
                height: 120,
            }}>
                <MaterialIcons name="show-chart" size={24} color={isDark ? '#6b7280' : '#9ca3af'} />
                <Text style={{ color: isDark ? '#6b7280' : '#9ca3af', fontSize: 12, marginTop: 4 }}>
                    Henuz yeterli mac verisi yok
                </Text>
            </View>
        );
    }

    const maxRating = 10;
    const graphHeight = 100;
    const barWidth = Math.max(20, Math.min(36, (300 - 32) / data.length));

    // Calculate overall average of matches in graph
    const graphAvg = data.reduce((sum, d) => sum + d.rating, 0) / (data.length || 1);

    // Calculate form trend: compare latest match rating against average of up to 3 previous matches
    let trend = 0;
    if (data.length >= 2) {
        const latestRating = data[data.length - 1].rating;
        const previousMatches = data.slice(0, -1).slice(-3); // previous up to 3 matches
        const previousAvg = previousMatches.reduce((sum, d) => sum + d.rating, 0) / (previousMatches.length || 1);
        trend = latestRating - previousAvg;
    }

    const getTrendIcon = (): { icon: string; color: string; text: string } => {
        if (trend > 0.1) return { icon: 'trending-up', color: '#22c55e', text: 'Yükselişte' };
        if (trend < -0.1) return { icon: 'trending-down', color: '#ef4444', text: 'Düşüşte' };
        return { icon: 'trending-flat', color: '#f59e0b', text: 'Stabil' };
    };

    const trendInfo = getTrendIcon();

    const getBarColor = (rating: number): string => {
        if (rating >= 8) return '#10B981';
        if (rating >= 7) return '#22c55e';
        if (rating >= 5) return '#f59e0b';
        return '#ef4444';
    };

    return (
        <View style={{
            backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#f9fafb',
            borderRadius: 16,
            padding: 16,
            borderWidth: 1,
            borderColor: isDark ? 'rgba(255,255,255,0.08)' : '#e5e7eb',
        }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <MaterialIcons name="show-chart" size={18} color={isDark ? '#9ca3af' : '#6b7280'} />
                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: isDark ? 'white' : '#111827' }}>
                        Form Grafiği
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: trendInfo.color + '20', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                    <MaterialIcons name={trendInfo.icon as any} size={14} color={trendInfo.color} />
                    <Text style={{ fontSize: 11, fontWeight: '600', color: trendInfo.color }}>{trendInfo.text}</Text>
                </View>
            </View>

            {/* Graph */}
            <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-around', height: graphHeight + 20, paddingTop: 10 }}>
                {data.map((match, idx) => {
                    const barHeight = Math.max(4, (match.rating / maxRating) * graphHeight);
                    const color = getBarColor(match.rating);

                    return (
                        <View key={match.matchId || idx} style={{ alignItems: 'center', width: barWidth }}>
                            {/* Rating Label */}
                            <Text style={{ fontSize: 9, fontWeight: 'bold', color: color, marginBottom: 2 }}>
                                {match.rating.toFixed(1)}
                            </Text>
                            {/* Bar */}
                            <View style={{
                                width: barWidth - 6,
                                height: barHeight,
                                backgroundColor: color,
                                borderRadius: 4,
                                opacity: 0.85,
                            }} />
                            {/* Goal/Assist dots */}
                            <View style={{ flexDirection: 'row', gap: 1, marginTop: 3 }}>
                                {match.goals > 0 && (
                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
                                )}
                                {match.assists > 0 && (
                                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#3b82f6' }} />
                                )}
                            </View>
                        </View>
                    );
                })}
            </View>

            {/* Legend */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 12, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: isDark ? 'rgba(255,255,255,0.05)' : '#f3f4f6', flexWrap: 'wrap' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#10B981' }} />
                    <Text style={{ fontSize: 10, color: isDark ? '#9ca3af' : '#6b7280' }}>8.0+ Puan</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#22c55e' }} />
                    <Text style={{ fontSize: 10, color: isDark ? '#9ca3af' : '#6b7280' }}>7.0+ Puan</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#f59e0b' }} />
                    <Text style={{ fontSize: 10, color: isDark ? '#9ca3af' : '#6b7280' }}>5.0+ Puan</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <View style={{ width: 8, height: 8, borderRadius: 2, backgroundColor: '#ef4444' }} />
                    <Text style={{ fontSize: 10, color: isDark ? '#9ca3af' : '#6b7280' }}>5.0 Altı</Text>
                </View>
            </View>

            {/* Average */}
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 6 }}>
                <Text style={{ fontSize: 11, color: isDark ? '#9ca3af' : '#6b7280' }}>
                    Ortalama: <Text style={{ fontWeight: 'bold', color: isDark ? 'white' : '#111827' }}>{graphAvg.toFixed(1)}</Text>
                    {data.length >= 2 && (
                        <Text style={{ color: trend > 0.1 ? '#22c55e' : (trend < -0.1 ? '#ef4444' : '#f59e0b') }}>
                            {' '}({trend > 0 ? '+' : ''}{trend.toFixed(1)})
                        </Text>
                    )}
                </Text>
            </View>
        </View>
    );
}

/**
 * Calculate performance rating from match stats
 */
export function calculateMatchRating(stats: {
    goals: number;
    assists: number;
    won: boolean;
    cleanSheet?: boolean;
    isMotm?: boolean;
    [key: string]: any;
}): number {
    let rating = 5.0; // Base rating

    // Goals: +1.5 each (max 3)
    rating += Math.min(stats.goals * 1.5, 3);

    // Assists: +1.0 each (max 2)
    rating += Math.min(stats.assists * 1.0, 2);

    // Win bonus
    if (stats.won) rating += 1.0;

    // Clean sheet (for defenders/GK)
    if (stats.cleanSheet) rating += 0.5;

    // MOTM bonus
    if (stats.isMotm) rating += 0.5;

    return Math.min(10, Math.max(1, rating));
}
