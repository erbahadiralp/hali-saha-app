import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '../../components/CustomAlertProvider';
import { SectionLabel, SettingsScreen, useSettingsColors } from '../../components/settings/SettingsUI';
import { palette, withOpacity } from '../../constants/designTokens';
import { useAuth } from '../../context/AuthContext';
import {
    activateVacation,
    deactivateVacation,
    getVacationStatus,
    VACATION_MAX_DAYS,
    VACATION_MIN_DAYS,
    VACATIONS_PER_YEAR,
    VacationRecord,
} from '../../services/vacationService';

type VacationType = VacationRecord['type'];

const MODES: { type: VacationType; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { type: 'vacation', label: 'Tatil Modu', icon: 'airplane-outline' },
    { type: 'injury', label: 'Sakatlık Modu', icon: 'medkit-outline' },
];

const DAY_MS = 1000 * 60 * 60 * 24;
const toDate = (value: any): Date => (value?.toDate ? value.toDate() : new Date(value));
const typeLabel = (type: VacationType) => (type === 'injury' ? 'Sakatlık Modu' : 'Tatil Modu');
const monthName = (date: Date) => {
    const name = format(date, 'LLLL', { locale: tr });
    return name.charAt(0).toLocaleUpperCase('tr-TR') + name.slice(1);
};

export default function VacationSettingsScreen() {
    const { user } = useAuth();
    const { alert } = useAlert();
    const insets = useSafeAreaInsets();
    const C = useSettingsColors();

    const [loading, setLoading] = useState(true);
    const [actionLoading, setActionLoading] = useState(false);
    const [isOnVacation, setIsOnVacation] = useState(false);
    const [currentVacation, setCurrentVacation] = useState<VacationRecord | undefined>();
    const [vacationsThisYear, setVacationsThisYear] = useState(0);
    const [canActivate, setCanActivate] = useState(false);
    const [history, setHistory] = useState<VacationRecord[]>([]);
    const [mode, setMode] = useState<VacationType>('vacation');
    const [duration, setDuration] = useState(14);

    const fetchStatus = async () => {
        if (!user) return;
        try {
            const status = await getVacationStatus(user.uid);
            setIsOnVacation(status.isOnVacation);
            setCurrentVacation(status.currentVacation);
            setVacationsThisYear(status.vacationsThisYear);
            setCanActivate(status.canActivate);
            setHistory(status.history);
        } catch (err) {
            console.error('Vacation status error:', err);
        } finally {
            setLoading(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchStatus();
        }, [user])
    );

    const remainingRights = Math.max(0, VACATIONS_PER_YEAR - vacationsThisYear);

    const handleActivate = () => {
        alert(
            'Emin misiniz?',
            `${typeLabel(mode)} ${duration} gün boyunca aktif olacak.\n\n• Aktivite puanın donacak\n• En az ${VACATION_MIN_DAYS} gün aktif kalacak\n• Bu yıl ${remainingRights} hakkın kaldı`,
            [
                { text: 'İptal', style: 'cancel' },
                {
                    text: 'Aktifleştir',
                    onPress: async () => {
                        setActionLoading(true);
                        try {
                            const result = await activateVacation(user!.uid, mode, duration);
                            if (result.success) {
                                alert('Başarılı', 'İzin modu aktifleştirildi! Aktivite puanın donduruldu.', [], { type: 'success' });
                                await fetchStatus();
                            } else {
                                alert('Hata', result.error || 'Bir hata oluştu.', [], { type: 'error' });
                            }
                        } catch (err) {
                            alert('Hata', 'İzin modu aktifleştirilemedi.', [], { type: 'error' });
                        } finally {
                            setActionLoading(false);
                        }
                    }
                }
            ],
            { type: 'warning' }
        );
    };

    const handleDeactivate = () => {
        alert(
            'İzin Modunu Kapat',
            'İzin modunu kapatmak istediğine emin misin? Aktivite puanın yeniden hesaplanmaya başlayacak.',
            [
                { text: 'İptal', style: 'cancel' },
                {
                    text: 'Kapat',
                    style: 'destructive',
                    onPress: async () => {
                        setActionLoading(true);
                        try {
                            const result = await deactivateVacation(user!.uid);
                            if (result.success) {
                                alert('Başarılı', 'İzin modu kapatıldı. Aktivite puanın yeniden hesaplanacak.', [], { type: 'success' });
                                await fetchStatus();
                            } else {
                                alert('Hata', result.error || 'Bir hata oluştu.', [], { type: 'error' });
                            }
                        } catch (err) {
                            alert('Hata', 'İzin modu kapatılamadı.', [], { type: 'error' });
                        } finally {
                            setActionLoading(false);
                        }
                    }
                }
            ],
            { type: 'warning' }
        );
    };

    const daysUntil = (value: any) => (value ? Math.max(0, Math.ceil((toDate(value).getTime() - Date.now()) / DAY_MS)) : 0);
    const daysRemaining = daysUntil(currentVacation?.endsAt);
    const minDeactivationDays = daysUntil(currentVacation?.minDeactivationDate);
    const canDeactivateNow = minDeactivationDays <= 0;

    const sortedHistory = history
        .filter(rec => !rec.isActive)
        .sort((a, b) => toDate(b.startedAt).getTime() - toDate(a.startedAt).getTime());

    if (loading) {
        return (
            <SettingsScreen title="İzin Modu">
                <View style={st.center}>
                    <ActivityIndicator size="large" color={C.primaryText} />
                </View>
            </SettingsScreen>
        );
    }

    const renderAction = () => {
        if (isOnVacation) {
            const disabled = !canDeactivateNow || actionLoading;
            return (
                <TouchableOpacity
                    onPress={handleDeactivate}
                    disabled={disabled}
                    activeOpacity={0.8}
                    style={[st.cta, { backgroundColor: C.card, borderColor: C.border, borderWidth: 1 }, disabled && st.disabled]}
                >
                    {actionLoading ? <ActivityIndicator color={C.error} /> : (
                        <Text style={[st.ctaText, { color: canDeactivateNow ? C.error : C.textSecondary }]}>
                            {canDeactivateNow ? 'İzin Modunu Kapat' : `${minDeactivationDays} gün sonra kapatılabilir`}
                        </Text>
                    )}
                </TouchableOpacity>
            );
        }
        const disabled = !canActivate || actionLoading;
        return (
            <TouchableOpacity
                onPress={handleActivate}
                disabled={disabled}
                activeOpacity={0.8}
                style={[st.cta, { backgroundColor: C.primary }, disabled && st.disabled]}
            >
                {actionLoading ? <ActivityIndicator color={C.onPrimary} /> : (
                    <Text style={[st.ctaText, { color: C.onPrimary }]}>
                        {canActivate ? 'İzin Modunu Aktifleştir' : 'Bu yıl izin hakkın doldu'}
                    </Text>
                )}
            </TouchableOpacity>
        );
    };

    return (
        <SettingsScreen title="İzin Modu">
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
                showsVerticalScrollIndicator={false}
            >
                {isOnVacation && currentVacation ? (
                    <>
                        <SectionLabel style={st.firstLabel}>Aktif İzin</SectionLabel>
                        <View style={[st.card, { backgroundColor: C.card, borderColor: C.isDark ? palette.darkGreen : C.border }]}>
                            <View style={st.activeHeader}>
                                <View style={[st.activeIcon, { backgroundColor: withOpacity(C.accent, 0.14) }]}>
                                    <Ionicons name={currentVacation.type === 'injury' ? 'medkit-outline' : 'airplane-outline'} size={22} color={C.link} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[st.activeTitle, { color: C.text }]}>{typeLabel(currentVacation.type)} Aktif</Text>
                                    <Text style={[st.muted, { color: C.textSecondary }]}>Rating ve aktivite puanın donduruldu</Text>
                                </View>
                                <Text style={[st.daysBig, { color: C.link }]}>{daysRemaining}<Text style={[st.daysUnit, { color: C.textSecondary }]}> gün</Text></Text>
                            </View>
                            {[
                                { label: 'Başlangıç', value: format(toDate(currentVacation.startedAt), 'd MMMM yyyy', { locale: tr }) },
                                { label: 'Bitiş', value: format(toDate(currentVacation.endsAt), 'd MMMM yyyy', { locale: tr }) },
                            ].map(row => (
                                <View key={row.label} style={[st.infoRow, { borderTopColor: C.divider }]}>
                                    <Text style={[st.muted, { color: C.textSecondary }]}>{row.label}</Text>
                                    <Text style={[st.infoValue, { color: C.text }]}>{row.value}</Text>
                                </View>
                            ))}
                        </View>
                    </>
                ) : (
                    <>
                        <SectionLabel style={st.firstLabel}>Mod Türü</SectionLabel>
                        <View style={st.modeRow}>
                            {MODES.map(m => {
                                const selected = mode === m.type;
                                return (
                                    <TouchableOpacity
                                        key={m.type}
                                        onPress={() => setMode(m.type)}
                                        activeOpacity={0.8}
                                        accessibilityRole="radio"
                                        accessibilityState={{ selected }}
                                        style={[
                                            st.modeCard,
                                            { backgroundColor: C.card, borderColor: selected ? C.primary : C.border },
                                            selected && { backgroundColor: withOpacity(C.accent, C.isDark ? 0.08 : 0.1) },
                                        ]}
                                    >
                                        <Ionicons name={m.icon} size={26} color={selected ? C.link : C.textSecondary} />
                                        <Text style={[st.modeLabel, { color: C.text }]}>{m.label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>

                        <View style={[st.card, st.noteCard, { backgroundColor: C.card, borderColor: C.isDark ? palette.darkGreen : C.border }]}>
                            <Text style={[st.note, { color: C.textSecondary }]}>
                                Aktif olduğu sürece rating ve aktivite puanın dondurulur, düşüş yaşamazsın.
                            </Text>
                        </View>

                        <SectionLabel>Süre</SectionLabel>
                        <View style={st.durationHead}>
                            <Text style={[st.durationValue, { color: C.text }]}>{duration} gün</Text>
                            <Text style={[st.small, { color: C.textTertiary }]}>Min {VACATION_MIN_DAYS} · Maks {VACATION_MAX_DAYS} gün</Text>
                        </View>
                        <Slider
                            style={st.slider}
                            minimumValue={VACATION_MIN_DAYS}
                            maximumValue={VACATION_MAX_DAYS}
                            step={1}
                            value={duration}
                            onValueChange={setDuration}
                            disabled={!canActivate}
                            minimumTrackTintColor={C.isDark ? palette.greenBright : C.primary}
                            maximumTrackTintColor={C.toggleOff}
                            thumbTintColor={C.isDark ? palette.white : C.primary}
                        />
                    </>
                )}

                <Text style={[st.small, { color: C.textTertiary, marginTop: 6 }]}>
                    Yılda en fazla {VACATIONS_PER_YEAR} kez kullanılabilir · Bu yıl {remainingRights} hakkın kaldı
                </Text>

                {sortedHistory.length > 0 && (
                    <>
                        <SectionLabel>Geçmiş İzinler</SectionLabel>
                        {sortedHistory.map((rec, idx) => {
                            const start = toDate(rec.startedAt);
                            const end = toDate(rec.deactivatedAt || rec.endsAt);
                            const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
                            return (
                                <View
                                    key={rec.id || idx}
                                    style={[st.historyRow, { borderBottomColor: C.divider }, idx === sortedHistory.length - 1 && { borderBottomWidth: 0 }]}
                                >
                                    <Text style={[st.historyType, { color: C.text }]}>{typeLabel(rec.type)}</Text>
                                    <Text style={[st.historyMeta, { color: C.textSecondary }]}>
                                        {monthName(start)} · {days} gün
                                    </Text>
                                </View>
                            );
                        })}
                    </>
                )}
            </ScrollView>

            <View style={[st.footer, { paddingBottom: insets.bottom + 12 }]}>
                {renderAction()}
            </View>
        </SettingsScreen>
    );
}

const st = StyleSheet.create({
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    firstLabel: {
        marginTop: 8,
    },
    modeRow: {
        flexDirection: 'row',
        gap: 10,
        marginTop: 4,
    },
    modeCard: {
        flex: 1,
        alignItems: 'center',
        gap: 8,
        paddingVertical: 18,
        paddingHorizontal: 10,
        borderRadius: 16,
        borderWidth: 1.5,
    },
    modeLabel: {
        fontSize: 13.5,
        fontWeight: '800',
    },
    card: {
        borderRadius: 20,
        borderWidth: 1,
        padding: 16,
    },
    noteCard: {
        marginTop: 18,
    },
    note: {
        fontSize: 12.5,
        fontWeight: '600',
        lineHeight: 20,
    },
    durationHead: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        marginLeft: 4,
    },
    durationValue: {
        fontSize: 20,
        fontWeight: '800',
    },
    small: {
        fontSize: 11.5,
        fontWeight: '600',
        marginLeft: 4,
    },
    slider: {
        width: '100%',
        height: 40,
        marginTop: 4,
    },
    activeHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        marginBottom: 12,
    },
    activeIcon: {
        width: 44,
        height: 44,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    activeTitle: {
        fontSize: 15,
        fontWeight: '800',
    },
    muted: {
        fontSize: 12.5,
        fontWeight: '500',
        marginTop: 2,
    },
    daysBig: {
        fontSize: 24,
        fontWeight: '800',
    },
    daysUnit: {
        fontSize: 12,
        fontWeight: '600',
    },
    infoRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 10,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    infoValue: {
        fontSize: 13,
        fontWeight: '700',
    },
    historyRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
    },
    historyType: {
        fontSize: 13.5,
        fontWeight: '700',
    },
    historyMeta: {
        fontSize: 12,
        fontWeight: '600',
    },
    footer: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },
    cta: {
        height: 54,
        borderRadius: 16,
        alignItems: 'center',
        justifyContent: 'center',
    },
    ctaText: {
        fontSize: 16,
        fontWeight: '700',
    },
    disabled: {
        opacity: 0.5,
    },
});
