import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { usePremium } from '../context/PremiumContext';

interface AdBannerProps {
    placement?: 'home' | 'match' | 'group' | 'profile' | 'matchList' | 'groupDetail';
    style?: any;
}

/**
 * Ad Banner Placeholder
 * Shows for free users only. Will be replaced with AdMob after prebuild.
 * For now, shows a subtle "upgrade" prompt that doubles as ad space.
 */
export function AdBanner({ placement = 'home', style }: AdBannerProps) {
    const { hasAds, tier } = usePremium();
    const router = useRouter();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    // Don't show for premium users
    if (!hasAds) return null;

    const messages: Record<string, { title: string; subtitle: string; icon: string }> = {
        home: {
            title: 'Reklamsız deneyim için',
            subtitle: 'Oyuncu Pro\'ya yükselin',
            icon: 'workspace-premium',
        },
        match: {
            title: 'Maç deneyimini iyileştir',
            subtitle: 'Akıllı kadro dengeleme için Kaptan Pro',
            icon: 'sports-soccer',
        },
        group: {
            title: 'Grup yönetimini kolaylaştır',
            subtitle: 'Kaptan Pro ile sınırsız özellik',
            icon: 'groups',
        },
        profile: {
            title: 'İstatistiklerini daha iyi takip et',
            subtitle: 'Oyuncu Pro ile form grafiği',
            icon: 'analytics',
        },
        matchList: {
            title: 'Maçlarını daha iyi yönet',
            subtitle: 'Premium ile tüm istatistiklere eriş',
            icon: 'emoji-events',
        },
        groupDetail: {
            title: 'Grup analizlerini gör',
            subtitle: 'Kaptan Pro ile detaylı istatistikler',
            icon: 'leaderboard',
        },
    };

    const msg = messages[placement] || messages.home;

    return (
        <TouchableOpacity
            onPress={() => router.push('/settings/premium')}
            activeOpacity={0.8}
            style={[{
                flexDirection: 'row',
                alignItems: 'center',
                padding: 12,
                backgroundColor: isDark ? 'rgba(39,255,15,0.04)' : '#f0fdf4',
                borderWidth: 1,
                borderColor: isDark ? 'rgba(16, 185, 129, 0.05)' : '#dcfce7',
                borderRadius: 14,
                marginVertical: 8,
                gap: 10,
            }, style]}
        >
            <View style={{
                width: 40,
                height: 40,
                borderRadius: 12,
                backgroundColor: isDark ? 'rgba(16, 185, 129, 0.08)' : '#bbf7d0',
                alignItems: 'center',
                justifyContent: 'center',
            }}>
                <MaterialIcons name={msg.icon as any} size={20} color="#10B981" />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '600', color: isDark ? 'white' : '#111827' }}>
                    {msg.title}
                </Text>
                <Text style={{ fontSize: 11, color: isDark ? '#8a9a88' : '#6b7280', marginTop: 1 }}>
                    {msg.subtitle}
                </Text>
            </View>
            <View style={{
                backgroundColor: '#10B981',
                paddingHorizontal: 12,
                paddingVertical: 7,
                borderRadius: 10,
            }}>
                <Text style={{ fontSize: 11, fontWeight: 'bold', color: '#0a0a0a' }}>YÜKSELT</Text>
            </View>
        </TouchableOpacity>
    );
}

/**
 * Compact inline ad for lists (between items)
 */
export function InlineAd({ style }: { style?: any }) {
    const { hasAds } = usePremium();
    const router = useRouter();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    if (!hasAds) return null;

    return (
        <TouchableOpacity
            onPress={() => router.push('/settings/premium')}
            activeOpacity={0.8}
            style={[{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 10,
                backgroundColor: isDark ? 'rgba(255,255,255,0.03)' : '#fafafa',
                borderRadius: 10,
                marginVertical: 6,
                gap: 6,
            }, style]}
        >
            <MaterialIcons name="star" size={14} color="#10B981" />
            <Text style={{ fontSize: 11, color: isDark ? '#8a9a88' : '#9ca3af', fontWeight: '500' }}>
                Reklamsız deneyim için Premium'a geç
            </Text>
            <MaterialIcons name="chevron-right" size={16} color={isDark ? '#8a9a88' : '#9ca3af'} />
        </TouchableOpacity>
    );
}

/**
 * Interstitial ad placeholder (full screen)
 * Will be replaced with AdMob interstitial after prebuild
 */
export function useInterstitialAd() {
    const { hasAds } = usePremium();

    const showInterstitial = async (): Promise<boolean> => {
        if (!hasAds) return false;

        // TODO: Replace with real AdMob interstitial
        // For now, just return false (no ad shown)
        console.log('[AdMob Placeholder] Interstitial would show here');
        return false;
    };

    return { showInterstitial, isReady: hasAds };
}

/**
 * Rewarded ad placeholder
 * Will be replaced with AdMob rewarded ad after prebuild
 */
export function useRewardedAd() {
    const { hasAds } = usePremium();

    const showRewardedAd = async (): Promise<boolean> => {
        if (!hasAds) return false;

        // TODO: Replace with real AdMob rewarded ad
        console.log('[AdMob Placeholder] Rewarded ad would show here');
        // In production, return true only if the user watched the full ad
        return true; // For testing, assume user watched ad
    };

    return { showRewardedAd, isReady: hasAds };
}
