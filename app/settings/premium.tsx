import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAlert } from '../../components/CustomAlertProvider';
import { SubscriptionTier, usePremium } from '../../context/PremiumContext';
import { getThemeColors, palette, withOpacity } from '../../constants/designTokens';
import { useTheme } from '../../context/ThemeContext';
import { mediumHaptic, successHaptic } from '../../services/haptics';

type BillingPeriod = 'monthly' | 'yearly';

interface PackageCard {
    id: SubscriptionTier | 'token';
    title: string;
    subtitle: string;
    icon: keyof typeof MaterialIcons.glyphMap;
    color: string;
    monthlyPrice: string;
    yearlyPrice: string;
    oneTimePrice?: string;
    yearlySavings?: string;
    popular?: boolean;
    badgeText?: string;
}

const packages: PackageCard[] = [
    {
        id: 'player',
        title: 'Oyuncu Pro',
        subtitle: 'Performansını takip et, farkını göster',
        icon: 'person',
        color: palette.warning,
        monthlyPrice: '29 ₺',
        yearlyPrice: '239 ₺',
        yearlySavings: '%33 Tasarruf',
    },
    {
        id: 'captain',
        title: 'Kaptan Pro',
        subtitle: 'Maç organize et, her şeyi yönet',
        icon: 'sports-soccer',
        color: palette.green,
        popular: true,
        badgeText: 'Popüler',
        monthlyPrice: '129 ₺',
        yearlyPrice: '999 ₺',
        yearlySavings: '%35 Tasarruf',
    },
    {
        id: 'token',
        title: 'Jeton',
        subtitle: '1 maçlık Kaptan özellikleri',
        icon: 'confirmation-number',
        color: palette.muted,
        badgeText: 'Tek maç',
        monthlyPrice: '39 ₺',
        yearlyPrice: '39 ₺',
        oneTimePrice: '39 ₺',
    },
];

const getFeaturesForPlan = (planId: string): { label: string; active: boolean }[] => {
    if (planId === 'player') {
        return [
            { label: 'Reklamsız deneyim', active: true },
            { label: '3 gruba üyelik', active: true },
            { label: 'Tam istatistikler', active: true },
            { label: 'Form grafiği', active: true },
            { label: 'Overall puanı', active: true },
            { label: 'Tüm sıralamalar', active: true },
            { label: 'Sınırsız maç oluşturma', active: false },
            { label: 'Akıllı kadro', active: false },
        ];
    } else if (planId === 'captain') {
        return [
            { label: 'Reklamsız deneyim', active: true },
            { label: 'Sınırsız grup & maç', active: true },
            { label: 'Tam istatistikler', active: true },
            { label: 'Form grafiği', active: true },
            { label: 'Overall puanı', active: true },
            { label: 'Tüm sıralamalar', active: true },
            { label: 'Sınırsız maç oluşturma', active: true },
            { label: 'Akıllı kadro', active: true },
        ];
    } else { // token
        return [
            { label: 'Akıllı kadro (1 maç)', active: true },
            { label: 'Maç özelleştirme', active: true },
            { label: 'Borç takibi (1 maç)', active: true },
            { label: '3 gruba üyelik', active: false },
            { label: 'Reklamsız deneyim', active: false },
            { label: 'Sınırsız maç oluşturma', active: false },
            { label: 'Overall puanı', active: false },
            { label: 'Tüm sıralamalar', active: false },
        ];
    }
};

export default function PremiumScreen() {
    const { alert } = useAlert();
    const router = useRouter();
    const { isDark } = useTheme();
    const { tier, setTier, isPremium } = usePremium();

    const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('yearly');
    const [selectedPlanId, setSelectedPlanId] = useState<SubscriptionTier | 'token'>('captain');

    const tierLabels: Record<string, string> = {
        free: 'Ücretsiz',
        player: 'Oyuncu Pro',
        captain: 'Kaptan Pro',
    };

    // Sandbox tier switch; the server may refuse (e.g. SANDBOX_PURCHASES off), so failures are shown.
    const applyTier = async (next: SubscriptionTier, successMessage?: string) => {
        try {
            await setTier(next);
            successHaptic();
            if (successMessage) alert('Test Modu', successMessage, [], { type: 'success' });
        } catch (error: any) {
            console.error('Sandbox tier change failed:', error);
            alert('Abonelik Değiştirilemedi', error?.message || 'Sunucu isteği reddetti. Cloud Functions deploy edildi mi?', [], { type: 'error' });
        }
    };

    const handlePurchase = (packageId: string) => {
        mediumHaptic();

        let price = '';
        if (packageId === 'player') {
            price = billingPeriod === 'yearly' ? '239 ₺/yıl' : '29 ₺/ay';
        } else if (packageId === 'captain') {
            price = billingPeriod === 'yearly' ? '999 ₺/yıl' : '129 ₺/ay';
        } else {
            price = '39 ₺ (tek seferlik)';
        }

        const pkg = packages.find(p => p.id === packageId);

        alert(
            'Sandbox Modu',
            `${pkg?.title} - ${price}\n\nRevenueCat henüz yapılandırılmadı. Test için aktif edilsin mi?`,
            [
                { text: 'İptal', style: 'cancel' },
                {
                    text: 'Aktif Et',
                    onPress: () => {
                        if (packageId === 'token') {
                            alert('Jeton', 'Jeton aktif edildi (test modu). Maç oluşturduğunuzda otomatik kullanılacak.');
                            successHaptic();
                        } else {
                            applyTier(packageId as SubscriptionTier);
                        }
                    }
                },
            ]
        );
    };

    const getTrialText = () => {
        if (selectedPlanId === 'token') {
            return '7 gün ücretsiz deneme bulunmamaktadır.';
        }
        const priceText = selectedPlanId === 'player'
            ? (billingPeriod === 'yearly' ? 'yıllık 239 ₺' : 'aylık 29 ₺')
            : (billingPeriod === 'yearly' ? 'yıllık 999 ₺' : 'aylık 129 ₺');
        return `7 gün ücretsiz · Sonra ${priceText}`;
    };

    const getButtonText = () => {
        if (selectedPlanId === tier) {
            return 'Mevcut Planınız';
        }
        if (selectedPlanId === 'token') {
            return 'Satın al';
        }
        return 'Ücretsiz dene';
    };

    const activeFeatures = getFeaturesForPlan(selectedPlanId);

    // Theme dependent colors (designTokens only)
    const T = getThemeColors(isDark);
    const accentText = T.primaryText;
    const colors = {
        bg: T.background,
        surface: T.card,
        border: T.border,
        text: T.text,
        textSecondary: T.textSecondary,
        textMuted: T.textTertiary,
        cardSelectedBg: withOpacity(T.accent, isDark ? 0.05 : 0.04),
        backButtonBg: T.card,
        featureIconInactiveBg: T.input,
        ctaBorder: T.text,
        ctaText: T.text,
    };

    return (
        <SafeAreaView style={[styles.container, { backgroundColor: colors.bg }]}>
            {/* Top Bar with Back Button */}
            <View style={styles.topBar}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={[styles.backButton, { backgroundColor: colors.backButtonBg, borderColor: colors.border }]}
                >
                    <MaterialIcons name="arrow-back" size={22} color={colors.text} />
                </TouchableOpacity>
            </View>

            <ScrollView 
                style={styles.scrollView} 
                contentContainerStyle={styles.scrollContainer}
                indicatorStyle={isDark ? 'white' : 'black'}
            >
                {/* Header Title Section */}
                <View style={styles.promoHeaderContainer}>
                    <Text style={[styles.promoLabel, { color: colors.textSecondary }]}>{"PREMIUM'A GEÇ"}</Text>
                    <Text style={[styles.promoTitle, { color: colors.text }]}>
                        Sahanın <Text style={{ color: accentText }}>kaptanı</Text> sen ol
                    </Text>
                </View>

                {/* Billing Switcher */}
                <View style={[styles.switcherContainer, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                    <TouchableOpacity
                        onPress={() => { setBillingPeriod('monthly'); mediumHaptic(); }}
                        style={[styles.switcherButton, billingPeriod === 'monthly' && { backgroundColor: T.primary }]}
                    >
                        <Text style={[
                            styles.switcherText, 
                            billingPeriod === 'monthly' ? { color: T.onPrimary } : { color: colors.textSecondary }
                        ]}>
                            Aylık
                        </Text>
                    </TouchableOpacity>
                    <View style={styles.switcherRightWrapper}>
                        {/* Savings Badge */}
                        <View style={[styles.savingsBadgeFloating, { backgroundColor: T.primary }]}>
                            <Text style={[styles.savingsBadgeFloatingText, { color: T.onPrimary }]}>%35 tasarruf</Text>
                        </View>
                        <TouchableOpacity
                            onPress={() => { setBillingPeriod('yearly'); mediumHaptic(); }}
                            style={[styles.switcherButton, billingPeriod === 'yearly' && { backgroundColor: T.primary }]}
                        >
                            <Text style={[
                                styles.switcherText, 
                                billingPeriod === 'yearly' ? { color: T.onPrimary } : { color: colors.textSecondary }
                            ]}>
                                Yıllık
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Side-by-Side Compact Package Cards */}
                <View style={styles.cardsRow}>
                    {packages.map((pkg) => {
                        const isToken = pkg.id === 'token';
                        const currentPrice = isToken
                            ? pkg.oneTimePrice
                            : (billingPeriod === 'yearly' ? pkg.yearlyPrice : pkg.monthlyPrice);
                        const periodText = isToken
                            ? 'tek seferlik'
                            : (billingPeriod === 'yearly' ? '/yıl' : '/ay');
                        const isSelected = pkg.id === selectedPlanId;
                        const isCurrentPlan = pkg.id === tier;

                        // Border and container styles
                        let borderColor = colors.border;
                        let borderWidth = 1.2;
                        if (isSelected) {
                            borderColor = T.accent;
                            borderWidth = 2;
                        } else if (pkg.popular) {
                            borderColor = withOpacity(T.accent, 0.4);
                        }

                        return (
                            <TouchableOpacity
                                key={pkg.id}
                                onPress={() => {
                                    setSelectedPlanId(pkg.id);
                                    mediumHaptic();
                                }}
                                style={[
                                    styles.compactCard,
                                    { backgroundColor: colors.surface, borderColor, borderWidth },
                                    isSelected && { backgroundColor: colors.cardSelectedBg }
                                ]}
                            >
                                {/* Top Badge */}
                                {pkg.popular && (
                                    <View style={[styles.compactBadge, { backgroundColor: withOpacity(T.accent, 0.15), borderColor: T.accent }]}>
                                        <Text style={[styles.compactBadgeText, { color: accentText }]}>Popüler</Text>
                                    </View>
                                )}
                                {isToken && (
                                    <View style={[styles.compactBadge, { backgroundColor: withOpacity(T.warning, 0.15), borderColor: T.warning }]}>
                                        <Text style={[styles.compactBadgeText, { color: T.warning }]}>Tek maç</Text>
                                    </View>
                                )}

                                <Text style={[
                                    styles.compactCardTitle, 
                                    { color: colors.textSecondary },
                                    isSelected && { color: accentText }
                                ]} numberOfLines={1}>
                                    {pkg.title}
                                </Text>
                                <Text style={[styles.compactCardPrice, { color: colors.text }]}>{currentPrice}</Text>
                                <Text style={[styles.compactCardPeriod, { color: colors.textMuted }]}>{periodText}</Text>

                                {/* Current Plan Indicator */}
                                {isCurrentPlan && (
                                    <View style={styles.currentIndicator}>
                                        <MaterialIcons name="check" size={10} color={accentText} />
                                        <Text style={[styles.currentIndicatorText, { color: accentText }]}>Mevcut</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Features 2-Column Comparison Grid */}
                <View style={styles.featuresGrid}>
                    {activeFeatures.map((feat, idx) => (
                        <View key={idx} style={[
                            styles.featureGridItem, 
                            { backgroundColor: colors.surface, borderColor: colors.border },
                            !feat.active && { opacity: 0.4 }
                        ]}>
                            <View style={[
                                styles.featureIconContainer,
                                feat.active 
                                    ? [styles.featureIconActive, { backgroundColor: withOpacity(T.accent, 0.12), borderColor: withOpacity(T.accent, 0.2) }]
                                    : [styles.featureIconInactive, { backgroundColor: colors.featureIconInactiveBg, borderColor: colors.border }]
                            ]}>
                                <MaterialIcons
                                    name={feat.active ? "check" : "close"}
                                    size={12}
                                    color={feat.active ? accentText : colors.textMuted}
                                />
                            </View>
                            <Text style={[
                                styles.featureGridText,
                                feat.active ? { color: colors.text } : { color: colors.textMuted }
                            ]} numberOfLines={2}>
                                {feat.label}
                            </Text>
                        </View>
                    ))}
                </View>

                {/* Trial & Purchase Action Section */}
                <View style={[styles.actionContainer, { borderBottomColor: colors.border }]}>
                    <Text style={[styles.actionPriceText, { color: colors.textSecondary }]}>{getTrialText()}</Text>
                    <TouchableOpacity
                        onPress={() => handlePurchase(selectedPlanId)}
                        disabled={selectedPlanId === tier}
                        style={[
                            styles.ctaButton,
                            { backgroundColor: colors.surface, borderColor: colors.ctaBorder },
                            selectedPlanId === tier && [styles.ctaButtonDisabled, { borderColor: colors.border }]
                        ]}
                    >
                        {selectedPlanId !== tier && (
                            <MaterialIcons name="play-arrow" size={20} color={colors.ctaText} style={{ marginRight: 2 }} />
                        )}
                        <Text style={[
                            styles.ctaButtonText,
                            { color: colors.ctaText },
                            selectedPlanId === tier && { color: colors.textMuted }
                        ]}>
                            {getButtonText()}
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Sandbox Test Toggle (dev only - hidden in production) */}
                {__DEV__ && (
                    <View style={[styles.sandboxContainer, { backgroundColor: withOpacity(T.accent, 0.03), borderColor: withOpacity(T.accent, 0.15) }]}>
                        <Text style={[styles.sandboxTitle, { color: accentText }]}>Sandbox Test (Geliştirici Modu)</Text>
                        <View style={styles.sandboxGrid}>
                            {(['free', 'player', 'captain'] as SubscriptionTier[]).map((t) => (
                                <TouchableOpacity
                                    key={t}
                                    onPress={() => { mediumHaptic(); applyTier(t); }}
                                    style={[
                                        styles.sandboxButton,
                                        { backgroundColor: colors.surface, borderColor: colors.border },
                                        tier === t && { backgroundColor: T.primary, borderColor: T.primary }
                                    ]}
                                >
                                    <Text style={[
                                        styles.sandboxButtonText, 
                                        { color: colors.text },
                                        tier === t && { color: T.onPrimary }
                                    ]}>
                                        {tierLabels[t]}
                                    </Text>
                                    {tier === t && <MaterialIcons name="check" size={16} color={T.onPrimary} />}
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                )}

                {/* Restore Purchases & Legal Links */}
                <View style={styles.linksContainer}>
                    <TouchableOpacity
                        onPress={() => alert('Satın Alım Geri Yükleme', 'RevenueCat yapılandırıldıktan sonra kullanılabilir.')}
                        style={styles.linkButton}
                    >
                        <Text style={[styles.linkText, { color: colors.textSecondary }]}>Satın alımları geri yükle</Text>
                    </TouchableOpacity>

                    {isPremium && (
                        <TouchableOpacity
                            onPress={() => alert(
                                'Aboneliği İptal Et',
                                'Aboneliğinizi iptal etmek istediğinize emin misiniz? Mevcut dönem sonuna kadar özellikler kullanılabilir kalacaktır.',
                                [
                                    { text: 'Vazgeç', style: 'cancel' },
                                    {
                                        text: 'İptal Et',
                                        style: 'destructive',
                                        onPress: () => applyTier('free', 'Aboneliğin iptal edildi.')
                                    },
                                ]
                            )}
                            style={styles.cancelButton}
                        >
                            <Text style={[styles.cancelButtonText, { color: T.error }]}>Aboneliği İptal Et</Text>
                        </TouchableOpacity>
                    )}

                    <Text style={[styles.legalInfoText, { color: colors.textMuted }]}>
                        Abonelikler otomatik yenilenir. İstediğiniz zaman Google Play Store / App Store ayarlarından iptal edebilirsiniz. Ödeme uygulama mağazası hesabınız üzerinden tahsil edilir.
                    </Text>

                    <View style={styles.legalLinksRow}>
                        <TouchableOpacity onPress={() => alert('Gizlilik Politikası', 'Gizlilik Sözleşmesi yakında eklenecektir.')}>
                            <Text style={[styles.legalLinkText, { color: accentText }]}>Gizlilik Politikası</Text>
                        </TouchableOpacity>
                        <Text style={[styles.legalDivider, { color: colors.border }]}>|</Text>
                        <TouchableOpacity onPress={() => alert('Kullanım Koşulları', 'Kullanım Sözleşmesi yakında eklenecektir.')}>
                            <Text style={[styles.legalLinkText, { color: accentText }]}>Kullanım Koşulları</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={[styles.legalInfoText, { color: colors.textMuted, marginTop: 8 }]}>
                        İstediğin zaman iptal edebilirsin
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
    },
    topBar: {
        paddingHorizontal: 16,
        paddingVertical: 12,
    },
    backButton: {
        width: 40,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: 20,
        borderWidth: 1,
    },
    scrollView: {
        flex: 1,
    },
    scrollContainer: {
        paddingHorizontal: 16,
        paddingBottom: 24,
    },
    promoHeaderContainer: {
        alignItems: 'center',
        paddingHorizontal: 24,
        marginTop: 8,
        marginBottom: 16,
    },
    promoLabel: {
        fontSize: 10,
        fontWeight: '800',
        letterSpacing: 1.5,
        textTransform: 'uppercase',
        marginBottom: 8,
    },
    promoTitle: {
        fontSize: 24,
        fontWeight: '900',
        textAlign: 'center',
        lineHeight: 32,
    },
    switcherContainer: {
        flexDirection: 'row',
        borderWidth: 1,
        borderRadius: 16,
        padding: 4,
        alignSelf: 'center',
        width: 240,
        marginBottom: 28,
        marginTop: 12,
    },
    switcherButton: {
        flex: 1,
        paddingVertical: 10,
        borderRadius: 12,
        alignItems: 'center',
        justifyContent: 'center',
    },
    switcherText: {
        fontSize: 14,
        fontWeight: '700',
    },
    switcherRightWrapper: {
        flex: 1,
        position: 'relative',
    },
    savingsBadgeFloating: {
        position: 'absolute',
        top: -16,
        right: 12,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        zIndex: 5,
    },
    savingsBadgeFloatingText: {
        fontSize: 9,
        fontWeight: '800',
    },
    cardsRow: {
        flexDirection: 'row',
        gap: 8,
        width: '100%',
        marginBottom: 24,
    },
    compactCard: {
        flex: 1,
        borderRadius: 20,
        paddingVertical: 20,
        paddingHorizontal: 8,
        alignItems: 'center',
        justifyContent: 'center',
        position: 'relative',
        borderWidth: 1.2,
    },
    compactBadge: {
        position: 'absolute',
        top: -10,
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 10,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    compactBadgeText: {
        fontSize: 8,
        fontWeight: '900',
        textTransform: 'uppercase',
    },
    compactCardTitle: {
        fontSize: 11,
        fontWeight: '700',
        marginBottom: 8,
    },
    compactCardPrice: {
        fontSize: 22,
        fontWeight: '800',
    },
    compactCardPeriod: {
        fontSize: 10,
        marginTop: 2,
    },
    currentIndicator: {
        position: 'absolute',
        bottom: 4,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 2,
    },
    currentIndicatorText: {
        fontSize: 8,
        fontWeight: '700',
    },
    featuresGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        width: '100%',
        marginBottom: 24,
    },
    featureGridItem: {
        width: '48%',
        borderWidth: 1,
        borderRadius: 16,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        marginBottom: 10,
        height: 52,
    },
    featureIconContainer: {
        width: 20,
        height: 20,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    featureIconActive: {
        borderWidth: 1,
    },
    featureIconInactive: {
        borderWidth: 1,
    },
    featureGridText: {
        fontSize: 11,
        fontWeight: '600',
        flex: 1,
    },
    actionContainer: {
        width: '100%',
        alignItems: 'center',
        marginTop: 8,
        paddingBottom: 24,
        borderBottomWidth: 1,
        marginBottom: 16,
    },
    actionPriceText: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: 12,
    },
    ctaButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1.5,
        borderRadius: 16,
        width: '100%',
        height: 54,
        gap: 6,
    },
    ctaButtonDisabled: {
        opacity: 0.6,
    },
    ctaButtonText: {
        fontSize: 16,
        fontWeight: '800',
    },
    sandboxContainer: {
        borderWidth: 1,
        borderRadius: 20,
        padding: 16,
        marginBottom: 24,
        width: '100%',
    },
    sandboxTitle: {
        fontSize: 12,
        fontWeight: 'bold',
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    sandboxGrid: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    sandboxButton: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 10,
        paddingHorizontal: 12,
        borderWidth: 1,
        borderRadius: 10,
        flex: 1,
        minWidth: '45%',
    },
    sandboxButtonText: {
        fontSize: 12,
        fontWeight: 'bold',
    },
    linksContainer: {
        alignItems: 'center',
        paddingBottom: 40,
    },
    linkButton: {
        padding: 12,
    },
    linkText: {
        fontSize: 13,
        textDecorationLine: 'underline',
    },
    cancelButton: {
        padding: 12,
        marginTop: 4,
    },
    cancelButtonText: {
        fontSize: 13,
        fontWeight: '600',
        textDecorationLine: 'underline',
    },
    legalInfoText: {
        textAlign: 'center',
        fontSize: 11,
        marginTop: 16,
        lineHeight: 16,
    },
    legalLinksRow: {
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 12,
        marginTop: 16,
    },
    legalLinkText: {
        fontSize: 12,
        fontWeight: '600',
    },
    legalDivider: {
        fontSize: 12,
    }
});
