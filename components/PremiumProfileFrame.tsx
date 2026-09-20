import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { Image } from 'expo-image';
import { Text, View, useColorScheme } from 'react-native';

interface PremiumProfileFrameProps {
    photoURL?: string;
    displayName: string;
    tier: 'free' | 'player' | 'captain';
    size?: number;
}

/**
 * Premium Profile Frame - Shows different frame based on tier
 * Free: no frame, Player Pro: gold frame, Captain Pro: green animated frame
 */
export function PremiumProfileFrame({ photoURL, displayName, tier, size = 48 }: PremiumProfileFrameProps) {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    const frameColor = tier === 'captain' ? '#10B981' : tier === 'player' ? '#FFD700' : 'transparent';
    const frameWidth = tier === 'free' ? 0 : 2.5;
    const badgeSize = size * 0.35;

    return (
        <View style={{ position: 'relative' }}>
            {/* Outer glow for premium */}
            {tier !== 'free' && (
                <View style={{
                    position: 'absolute',
                    top: -2,
                    left: -2,
                    right: -2,
                    bottom: -2,
                    borderRadius: (size / 2) + 4,
                    backgroundColor: frameColor + '30',
                }} />
            )}

            {/* Avatar */}
            <View style={{
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: frameWidth,
                borderColor: frameColor,
                overflow: 'hidden',
                backgroundColor: isDark ? '#1f2937' : '#e5e7eb',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                {photoURL ? (
                    <Image
                        source={{ uri: photoURL }}
                        style={{ width: size, height: size }}
                        contentFit="cover"
                    />
                ) : (
                    <Text style={{
                        fontSize: size * 0.4,
                        fontWeight: 'bold',
                        color: isDark ? '#9ca3af' : '#6b7280',
                    }}>
                        {displayName?.[0]?.toUpperCase() || '?'}
                    </Text>
                )}
            </View>

            {/* Tier Badge */}
            {tier !== 'free' && (
                <View style={{
                    position: 'absolute',
                    bottom: -2,
                    right: -2,
                    width: badgeSize,
                    height: badgeSize,
                    borderRadius: badgeSize / 2,
                    backgroundColor: frameColor,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1.5,
                    borderColor: isDark ? '#0a0a0a' : '#ffffff',
                }}>
                    <MaterialIcons
                        name={tier === 'captain' ? 'sports-soccer' : 'star'}
                        size={badgeSize * 0.55}
                        color="#0a0a0a"
                    />
                </View>
            )}
        </View>
    );
}
