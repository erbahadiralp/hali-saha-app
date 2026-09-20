import { MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Sharing from 'expo-sharing';
import React, { useEffect, useRef } from 'react';
import { Alert, Animated, Easing, Image, Text, TouchableOpacity, View } from 'react-native';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import { THEMES } from '../constants/cardThemes';
export { THEMES };

import { getLevelDetails } from '../services/userService';

interface PlayerStats {
    displayName: string;
    goals: number;
    assists: number;
    matchesPlayed: number;
    wins: number;
    motmCount: number;
    overall: number;
    position?: string;
    photoURL?: string;
    nickname?: string;
    preferredFoot?: 'left' | 'right' | 'both';
    followers?: number;
    following?: number;
    xp?: number;
}

interface StatsShareCardProps {
    stats: PlayerStats;
    theme?: string; // 'varsayilan' | 'elmas' | 'zumrut' | 'efsanevi' | 'ates'
    onSharePress?: () => void;
    hideShareButton?: boolean;
    canSeeOverall?: boolean;
}

// Particle/Ember Component for 'ates' theme
const EmberParticle = ({ delay, style }: { delay: number, style?: any }) => {
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(anim, {
                    toValue: 1,
                    duration: 2000 + Math.random() * 1000,
                    easing: Easing.inOut(Easing.ease),
                    useNativeDriver: true,
                    delay: delay,
                }),
                Animated.timing(anim, {
                    toValue: 0,
                    duration: 0,
                    useNativeDriver: true
                })
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [delay]);

    const translateY = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0, -40]
    });
    const opacity = anim.interpolate({
        inputRange: [0, 0.5, 1],
        outputRange: [0, 0.8, 0]
    });
    const scale = anim.interpolate({
        inputRange: [0, 1],
        outputRange: [0.5, 1.2]
    });

    return (
        <Animated.View style={[style, {
            transform: [{ translateY }, { scale }],
            opacity,
            width: 4, height: 4, borderRadius: 2,
            backgroundColor: Math.random() > 0.5 ? '#fb923c' : '#fbbf24',
            position: 'absolute',
        }]} />
    );
}

export function StatsShareCard({ stats, theme = 'varsayilan', onSharePress, hideShareButton = false, canSeeOverall = true }: StatsShareCardProps) {
    const viewShotRef = useRef<ViewShotRef>(null);
    const t = THEMES[theme] || THEMES.varsayilan;

    const handleShare = async () => {
        try {
            if (viewShotRef.current?.capture) {
                const uri = await viewShotRef.current.capture();
                if (await Sharing.isAvailableAsync()) {
                    await Sharing.shareAsync(uri, {
                        mimeType: 'image/png',
                        dialogTitle: 'Kartımı Paylaş',
                    });
                } else {
                    Alert.alert('Hata', 'Paylaşım bu cihazda desteklenmiyor.');
                }
            }
        } catch (error) {
            console.error('Share error:', error);
            Alert.alert('Hata', 'Paylaşım sırasında hata oluştu.');
        }
    };

    const getInitials = (name: string) => {
        if (!name) return 'U';
        const parts = name.trim().split(/\s+/);
        if (parts.length >= 2) {
            return (parts[0][0] + parts[1][0]).toUpperCase();
        }
        return name.substring(0, 2).toUpperCase();
    };

    const winRate = stats.matchesPlayed > 0 ? Math.round((stats.wins / stats.matchesPlayed) * 100) : 0;
    const { level, currentLevelXp, nextLevelXp, rank, progress } = getLevelDetails(stats.xp || 0);

    return (
        <View style={{ width: '100%', gap: 16, alignItems: 'center' }}>
            <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }} style={{ width: '100%' }}>
                <View style={{
                    backgroundColor: '#0E0F0E',
                    padding: 16,
                    borderRadius: 24,
                    borderWidth: 1,
                    borderColor: 'rgba(255,255,255,0.06)',
                    gap: 16,
                }}>
                    {/* REDESIGNED HORIZONTAL CARD */}
                    <View style={{
                        borderRadius: 18,
                        overflow: 'hidden',
                        width: '100%',
                        position: 'relative',
                        borderWidth: 1,
                        borderColor: t.border,
                    }}>
                        <LinearGradient
                            colors={t.colors}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={{ padding: 16 }}
                        >
                            {/* Pattern Overlay */}
                            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, opacity: t.patternOpacity }}>
                            </View>

                            {/* Embers for Fire Theme */}
                            {theme === 'ates' && (
                                <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, overflow: 'hidden' }} pointerEvents="none">
                                    {[...Array(12)].map((_, i) => (
                                        <EmberParticle key={i} delay={i * 200} style={{ left: `${10 + Math.random() * 80}%`, bottom: '10%' }} />
                                    ))}
                                </View>
                            )}

                            {/* Content Container */}
                            <View style={{ position: 'relative', zIndex: 10, width: '100%', gap: 12 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%' }}>
                                    
                                    {/* Left: Avatar */}
                                    <View style={{ marginRight: 14 }}>
                                        <View style={{
                                            width: 68,
                                            height: 68,
                                            borderRadius: 34,
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            borderWidth: 2,
                                            borderColor: t.photoBorder,
                                            backgroundColor: '#1f2937',
                                            overflow: 'hidden',
                                        }}>
                                            {stats.photoURL ? (
                                                <Image source={{ uri: stats.photoURL }} style={{ width: 68, height: 68 }} resizeMode="cover" />
                                            ) : (
                                                <Text style={{ fontSize: 24, fontWeight: '900', color: t.nameColor }}>
                                                    {getInitials(stats.displayName)}
                                                </Text>
                                            )}
                                        </View>
                                    </View>

                                    {/* Middle: Name, Position, Winrate, Followers */}
                                    <View style={{ flex: 1, justifyContent: 'center', gap: 4 }}>
                                        <Text style={{
                                            color: t.nameColor,
                                            fontSize: 18,
                                            fontWeight: '800',
                                            fontFamily: 'System',
                                        }} numberOfLines={1}>
                                            {stats.displayName ? stats.displayName.split(' ').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : 'Oyuncu'}
                                        </Text>

                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                                            <View style={{
                                                backgroundColor: t.pillBg,
                                                borderWidth: 1.5,
                                                borderColor: t.pillBorder,
                                                borderRadius: 8,
                                                paddingHorizontal: 8,
                                                paddingVertical: 2,
                                            }}>
                                                <Text style={{
                                                    color: t.pillColor,
                                                    fontSize: 10,
                                                    fontWeight: '800',
                                                    textTransform: 'uppercase'
                                                }}>
                                                    {stats.position || 'Belirtilmedi'}
                                                </Text>
                                            </View>

                                            {/* Nickname pill if exists */}
                                            {stats.nickname && (
                                                <View style={{
                                                    backgroundColor: t.pillBg,
                                                    borderWidth: 1.5,
                                                    borderColor: t.pillBorder,
                                                    borderRadius: 8,
                                                    paddingHorizontal: 8,
                                                    paddingVertical: 2,
                                                }}>
                                                    <Text style={{
                                                        color: t.pillColor,
                                                        fontSize: 10,
                                                        fontWeight: '800',
                                                    }}>
                                                        {stats.nickname}
                                                    </Text>
                                                </View>
                                            )}

                                            {stats.preferredFoot && (
                                                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                                                    <Text style={{
                                                        fontSize: 11,
                                                        transform: [{ scaleX: -1 }],
                                                        opacity: stats.preferredFoot === 'left' || stats.preferredFoot === 'both' ? 1 : 0.2,
                                                    }}>🦶</Text>
                                                    <Text style={{
                                                        fontSize: 11,
                                                        opacity: stats.preferredFoot === 'right' || stats.preferredFoot === 'both' ? 1 : 0.2,
                                                    }}>🦶</Text>
                                                </View>
                                            )}
                                        </View>

                                        <Text style={{
                                            color: t.levelColor,
                                            fontSize: 12,
                                            fontWeight: '700'
                                        }}>
                                            Galibiyet: %{winRate}
                                        </Text>

                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
                                            <View>
                                                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                                                    {stats.followers || 0} <Text style={{ color: t.metaColor, fontSize: 9 }}>TAKİPÇİ</Text>
                                                </Text>
                                            </View>
                                            <View style={{ width: 1, height: 12, backgroundColor: 'rgba(255,255,255,0.15)' }} />
                                            <View>
                                                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                                                    {stats.following || 0} <Text style={{ color: t.metaColor, fontSize: 9 }}>TAKİP</Text>
                                                </Text>
                                            </View>
                                        </View>
                                    </View>

                                    {/* Right: Big rating */}
                                    <View style={{ alignItems: 'center', minWidth: 60 }}>
                                        <Text style={{
                                            fontSize: 42,
                                            fontWeight: '900',
                                            color: t.levelColor,
                                            lineHeight: 46,
                                            fontStyle: 'italic',
                                        }}>
                                            {canSeeOverall ? (stats.overall || 75) : '—'}
                                        </Text>
                                        <Text style={{
                                            fontSize: 9,
                                            fontWeight: '800',
                                            color: t.metaColor,
                                            letterSpacing: 0.8,
                                            marginTop: 2,
                                        }}>
                                            GENEL
                                        </Text>
                                    </View>
                                </View>

                                {/* Divider Line */}
                                <View style={{ height: 1, backgroundColor: 'rgba(255,255,255,0.15)', marginVertical: 4 }} />

                                {/* XP / Level Row */}
                                <View style={{ zIndex: 1 }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                        <Text style={{
                                            color: t.nameColor,
                                            fontSize: 12,
                                            fontWeight: '800',
                                            letterSpacing: 0.5,
                                        }}>
                                            LV {level} · {rank}
                                        </Text>
                                        <View style={{
                                            backgroundColor: 'rgba(16, 185, 129, 0.12)',
                                            borderWidth: 1,
                                            borderColor: 'rgba(16, 185, 129, 0.3)',
                                            borderRadius: 8,
                                            paddingHorizontal: 8,
                                            paddingVertical: 2,
                                        }}>
                                            <Text style={{
                                                color: '#10B981',
                                                fontSize: 10,
                                                fontWeight: '800',
                                            }}>
                                                {currentLevelXp} / {nextLevelXp} XP
                                            </Text>
                                        </View>
                                    </View>

                                    <View style={{
                                        height: 6,
                                        borderRadius: 3,
                                        backgroundColor: 'rgba(255,255,255,0.15)',
                                        width: '100%',
                                        overflow: 'hidden',
                                    }}>
                                        <View style={{
                                            height: '100%',
                                            width: `${progress * 100}%`,
                                            backgroundColor: t.levelColor,
                                            borderRadius: 3,
                                        }} />
                                    </View>
                                </View>
                            </View>
                        </LinearGradient>
                    </View>

                    {/* 4-COLUMN STATS GRID */}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        {[
                            { label: 'GOL', value: stats.goals || 0, icon: 'sports-soccer' as const, color: '#10B981' },
                            { label: 'ASİST', value: stats.assists || 0, icon: 'share' as const, color: '#3B82F6' },
                            { label: 'MAÇ', value: stats.matchesPlayed || 0, icon: 'bar-chart' as const, color: '#F59E0B' },
                            { label: 'MVP', value: stats.motmCount || 0, icon: 'emoji-events' as const, color: '#EF4444' },
                        ].map((s, index) => (
                            <View
                                key={index}
                                style={{
                                    flex: 1,
                                    backgroundColor: '#161817',
                                    borderWidth: 1,
                                    borderColor: 'rgba(255,255,255,0.06)',
                                    borderRadius: 14,
                                    paddingVertical: 8,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                }}
                            >
                                <View style={{
                                    width: 24,
                                    height: 24,
                                    borderRadius: 12,
                                    backgroundColor: `${s.color}15`,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    marginBottom: 4,
                                }}>
                                    <MaterialIcons name={s.icon} size={12} color={s.color} />
                                </View>
                                <Text style={{
                                    color: '#ffffff',
                                    fontSize: 16,
                                    fontWeight: '900',
                                    marginBottom: 2,
                                }}>
                                    {s.value}
                                </Text>
                                <Text style={{
                                    color: '#a0a0a0',
                                    fontSize: 8,
                                    fontWeight: '700',
                                    letterSpacing: 0.5,
                                }}>
                                    {s.label}
                                </Text>
                            </View>
                        ))}
                    </View>
                </View>
            </ViewShot>

            {/* SHARE BUTTON OUTSIDE */}
            {!hideShareButton && (
                <TouchableOpacity
                    onPress={handleShare}
                    style={{
                        backgroundColor: '#10B981',
                        paddingHorizontal: 24,
                        paddingVertical: 14,
                        borderRadius: 16,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                        width: '100%',
                        justifyContent: 'center',
                        shadowColor: "#000",
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.2,
                        shadowRadius: 4,
                        elevation: 3
                    }}
                >
                    <MaterialIcons name="share" size={20} color="#000" />
                    <Text style={{ color: '#000', fontWeight: 'bold', fontSize: 15 }}>Kartımı Resim Olarak Paylaş</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}
