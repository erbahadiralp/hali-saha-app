import React from 'react';
import { Text, TouchableOpacity, useColorScheme, View } from 'react-native';
import { Badge, BADGE_DEFINITIONS, UserBadge } from '../services/badgeService';

interface BadgeDisplayProps {
    badges: UserBadge[];
    compact?: boolean;
    onBadgePress?: (badge: Badge) => void;
}

const TIER_COLORS = {
    bronze: '#CD7F32',
    silver: '#C0C0C0',
    gold: '#FFD700',
};

export default function BadgeDisplay({ badges, compact = false, onBadgePress }: BadgeDisplayProps) {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    if (badges.length === 0) return null;

    const sortedBadges = [...badges].sort((a, b) => {
        const tierOrder = { gold: 0, silver: 1, bronze: 2 };
        const aDef = BADGE_DEFINITIONS[a.badgeId];
        const bDef = BADGE_DEFINITIONS[b.badgeId];
        return (tierOrder[aDef?.tier || 'bronze'] || 2) - (tierOrder[bDef?.tier || 'bronze'] || 2);
    });

    if (compact) {
        return (
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                {sortedBadges.map((ub) => {
                    const def = BADGE_DEFINITIONS[ub.badgeId];
                    if (!def) return null;
                    return (
                        <TouchableOpacity
                            key={ub.badgeId}
                            onPress={() => onBadgePress?.(def)}
                            style={{
                                backgroundColor: TIER_COLORS[def.tier] + '20',
                                borderRadius: 12,
                                paddingHorizontal: 8,
                                paddingVertical: 4,
                                borderWidth: 1,
                                borderColor: TIER_COLORS[def.tier] + '40',
                            }}
                        >
                            <Text style={{ fontSize: 14 }}>{def.emoji}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        );
    }

    return (
        <View style={{ gap: 8 }}>
            <Text style={{
                fontSize: 16,
                fontWeight: 'bold',
                color: isDark ? 'white' : '#111827',
                marginBottom: 4,
            }}>
                🏆 Rozetler
            </Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {sortedBadges.map((ub) => {
                    const def = BADGE_DEFINITIONS[ub.badgeId];
                    if (!def) return null;
                    return (
                        <TouchableOpacity
                            key={ub.badgeId}
                            onPress={() => onBadgePress?.(def)}
                            style={{
                                backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'white',
                                borderRadius: 16,
                                padding: 12,
                                alignItems: 'center',
                                borderWidth: 1,
                                borderColor: TIER_COLORS[def.tier] + '60',
                                minWidth: 80,
                            }}
                        >
                            <Text style={{ fontSize: 28, marginBottom: 4 }}>{def.emoji}</Text>
                            <Text style={{
                                fontSize: 12,
                                fontWeight: 'bold',
                                color: TIER_COLORS[def.tier],
                                textAlign: 'center',
                            }}>
                                {def.name}
                            </Text>
                            <Text style={{
                                fontSize: 10,
                                color: isDark ? '#9ca3af' : '#6b7280',
                                textAlign: 'center',
                                marginTop: 2,
                            }}>
                                {def.requirement}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}
