import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React from 'react';
import { Modal, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface PremiumModalProps {
    visible: boolean;
    onClose: () => void;
    title?: string;
    message?: string;
    onWatchAd?: () => void;
}

export function PremiumModal({ visible, onClose, title, message, onWatchAd }: PremiumModalProps) {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const insets = useSafeAreaInsets();

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity
                activeOpacity={1}
                onPress={onClose}
                style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 24 }}
            >
                <TouchableOpacity activeOpacity={1} style={{ width: '100%', maxWidth: 340 }}>
                    <View style={{ backgroundColor: isDark ? '#1f2937' : 'white', borderRadius: 24, padding: 24, alignItems: 'center' }}>
                        {/* Crown Icon */}
                        <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: 'rgba(255, 215, 0, 0.2)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                            <MaterialIcons name="workspace-premium" size={40} color="#FFD700" />
                        </View>

                        <Text style={{ fontSize: 22, fontWeight: 'bold', color: isDark ? 'white' : '#111827', textAlign: 'center', marginBottom: 8 }}>
                            {title || 'Premium Özellik'}
                        </Text>

                        <Text style={{ fontSize: 15, color: isDark ? '#9ca3af' : '#6b7280', textAlign: 'center', marginBottom: 24, lineHeight: 22 }}>
                            {message || 'Bu özelliği kullanmak için Premium üye olun veya reklam izleyin.'}
                        </Text>

                        {/* Premium Button */}
                        <TouchableOpacity
                            onPress={() => { onClose(); router.push('/settings/premium'); }}
                            style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, backgroundColor: '#FFD700', borderRadius: 12, marginBottom: 12 }}
                        >
                            <MaterialIcons name="star" size={20} color="#11230f" />
                            <Text style={{ color: '#11230f', fontWeight: 'bold', fontSize: 16 }}>Premium Ol</Text>
                        </TouchableOpacity>

                        {/* Watch Ad Button */}
                        {onWatchAd && (
                            <TouchableOpacity
                                onPress={onWatchAd}
                                style={{ width: '100%', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, padding: 16, backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : '#f3f4f6', borderRadius: 12, marginBottom: 12 }}
                            >
                                <MaterialIcons name="play-circle-filled" size={20} color={isDark ? '#10B981' : '#059669'} />
                                <Text style={{ color: isDark ? 'white' : '#111827', fontWeight: '600', fontSize: 15 }}>Reklam İzle</Text>
                            </TouchableOpacity>
                        )}

                        {/* Close Button */}
                        <TouchableOpacity onPress={onClose}>
                            <Text style={{ color: isDark ? '#9ca3af' : '#6b7280', fontSize: 14, marginTop: 8 }}>Vazgeç</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </TouchableOpacity>
        </Modal>
    );
}

interface LimitWarningProps {
    type: 'group' | 'match';
    current: number;
    max: number;
    isPremium?: boolean;
    tier?: string;
}

export function LimitWarning({ type, current, max, isPremium, tier }: LimitWarningProps) {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    // Don't show if unlimited
    if (max === Infinity || isPremium) return null;

    const remaining = max - current;
    const typeText = type === 'group' ? 'grup' : 'mac';
    const periodText = type === 'match' ? ' (bu ay)' : '';

    if (remaining > 1) return null;

    const upgradeTarget = type === 'match' ? 'Kaptan Pro' : (tier === 'free' ? 'Oyuncu Pro' : 'Kaptan Pro');

    return (
        <TouchableOpacity
            onPress={() => router.push('/settings/premium')}
            style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                padding: 12,
                backgroundColor: remaining === 0 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(251, 191, 36, 0.1)',
                borderRadius: 12,
                marginVertical: 8
            }}
        >
            <MaterialIcons
                name={remaining === 0 ? "error" : "warning"}
                size={20}
                color={remaining === 0 ? '#ef4444' : '#f59e0b'}
            />
            <Text style={{ flex: 1, color: isDark ? 'white' : '#111827', fontSize: 13 }}>
                {remaining === 0
                    ? `Ucretsiz ${typeText} hakkiniz${periodText} doldu. ${upgradeTarget}'ya yukselin.`
                    : `Son ${remaining} ucretsiz ${typeText} hakkiniz${periodText} kaldi.`
                }
            </Text>
            <MaterialIcons name="chevron-right" size={18} color={isDark ? '#9ca3af' : '#6b7280'} />
        </TouchableOpacity>
    );
}

/**
 * Feature lock overlay for tier-gated features
 */
interface FeatureLockProps {
    requiredTier: 'player' | 'captain';
    children: React.ReactNode;
}

export function FeatureLock({ requiredTier, children }: FeatureLockProps) {
    const router = useRouter();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    const tierLabel = requiredTier === 'captain' ? 'Kaptan Pro' : 'Oyuncu Pro';

    return (
        <View style={{ position: 'relative' }}>
            <View style={{ opacity: 0.3 }} pointerEvents="none">
                {children}
            </View>
            <TouchableOpacity
                onPress={() => router.push('/settings/premium')}
                style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0, bottom: 0,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: isDark ? 'rgba(0,0,0,0.5)' : 'rgba(255,255,255,0.7)',
                    borderRadius: 12,
                }}
            >
                <MaterialIcons name="lock" size={24} color="#FFD700" />
                <Text style={{ color: isDark ? 'white' : '#111827', fontWeight: 'bold', fontSize: 13, marginTop: 4 }}>
                    {tierLabel}
                </Text>
                <Text style={{ color: isDark ? '#9ca3af' : '#6b7280', fontSize: 11 }}>
                    Yukseltmek icin dokun
                </Text>
            </TouchableOpacity>
        </View>
    );
}
