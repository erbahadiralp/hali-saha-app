import { Ionicons } from '@expo/vector-icons';
import { addDays, addMinutes, differenceInCalendarDays, format, startOfDay } from 'date-fns';
import { tr } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import istanbulVenues from '../assets/istanbul_sahalari.json';
import { useAlert } from '../components/CustomAlertProvider';
import { Avatar, Eyebrow, PrimaryButton, Segmented, Sheet, TextField } from '../components/group/GroupUI';
import { useSettingsColors } from '../components/settings/SettingsUI';
import { withOpacity } from '../constants/designTokens';
import { useAuth } from '../context/AuthContext';
import { usePremium } from '../context/PremiumContext';
import { createMatch, getUserGroups, getUserProfile } from '../services/firestore';
import { mediumHaptic, successHaptic } from '../services/haptics';

/**
 * Layout: design/tasarım/macvar-match-flow.html (Maç Oluştur); colors from designTokens.
 * Leaving "Grup Seçimi" empty creates a one-off match; picking a group creates a group match.
 */

const VENUES = Object.entries(istanbulVenues as Record<string, string[]>)
    .flatMap(([district, names]) => names.map(name => ({ name, district })))
    .sort((a, b) => a.name.localeCompare(b.name, 'tr'));
const DISTRICTS = Object.keys(istanbulVenues).sort((a, b) => a.localeCompare(b, 'tr'));
const FORMATS = [6, 7, 8];
const DURATIONS = ['60', '90', '120'] as const;
const DAYS_AHEAD = 30;
const TIME_SLOTS = Array.from({ length: 48 }, (_, i) => ({ h: Math.floor(i / 2), m: i % 2 ? 30 : 0 }));

type Picker = 'date' | 'time' | 'venue' | 'group' | null;

const defaultStart = () => {
    const d = new Date();
    d.setHours(d.getHours() + 2, 0, 0, 0);
    return d;
};

const dayLabel = (d: Date, now: number) => {
    const diff = differenceInCalendarDays(d, now);
    return diff === 0 ? 'Bugün' : diff === 1 ? 'Yarın' : null;
};

export default function CreateMatchScreen() {
    const params = useLocalSearchParams<{ groupId?: string }>();
    const router = useRouter();
    const { alert } = useAlert();
    const { user } = useAuth();
    const { canCreateMatch, incrementMatchCount } = usePremium();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    const [start, setStart] = useState(defaultStart);
    const [duration, setDuration] = useState<(typeof DURATIONS)[number]>('60');
    const [venue, setVenue] = useState<{ name: string; district?: string } | null>(null);
    const [perTeam, setPerTeam] = useState(7);
    const [price, setPrice] = useState('');
    const [groupId, setGroupId] = useState<string | null>(params.groupId || null);
    const [groups, setGroups] = useState<any[]>([]);
    const [profileName, setProfileName] = useState<string | null>(null);
    const [picker, setPicker] = useState<Picker>(null);
    const [venueQuery, setVenueQuery] = useState('');
    const [venueDistrict, setVenueDistrict] = useState<string | null>(null);
    const chipScrollRef = useRef<ScrollView>(null);
    const chipOffsets = useRef<Record<string, number>>({});
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!user) return;
        getUserProfile(user.uid).then((p: any) => setProfileName(p?.displayName || null)).catch(() => {});
        getUserGroups(user.uid).then(setGroups).catch(() => {});
    }, [user]);

    const isAdminOf = (g: any) => g.adminId === user?.uid || (g.admins || []).includes(user?.uid);
    const selectedGroup = groups.find(g => g.id === groupId);
    const end = addMinutes(start, Number(duration));

    // Search narrows every district; the district pills then narrow the list further.
    const { queryMatches, districtCounts } = useMemo(() => {
        const q = venueQuery.trim().toLocaleLowerCase('tr-TR');
        const matches = q ? VENUES.filter(v => `${v.name} ${v.district}`.toLocaleLowerCase('tr-TR').includes(q)) : VENUES;
        const counts: Record<string, number> = {};
        matches.forEach(v => { counts[v.district] = (counts[v.district] || 0) + 1; });
        return { queryMatches: matches, districtCounts: counts };
    }, [venueQuery]);
    const venueResults = venueDistrict ? queryMatches.filter(v => v.district === venueDistrict) : queryMatches;
    const visibleDistricts = DISTRICTS.filter(d => districtCounts[d] || d === venueDistrict);

    const openVenuePicker = () => {
        setVenueQuery('');
        setVenueDistrict(venue?.district ?? null);
        setPicker('venue');
    };

    const selectDistrict = (d: string | null) => {
        setVenueDistrict(d);
        if (d && chipOffsets.current[d] !== undefined) {
            chipScrollRef.current?.scrollTo({ x: Math.max(0, chipOffsets.current[d] - 16), animated: true });
        }
    };


    // "Today" and past time slots are re-evaluated whenever a picker opens or closes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const nowTs = useMemo(() => new Date().getTime(), [picker]);
    const openPicker = (next: Picker) => setPicker(next);
    const days = useMemo(() => Array.from({ length: DAYS_AHEAD }, (_, i) => addDays(startOfDay(nowTs), i)), [nowTs]);

    const pickDay = (day: Date) => {
        const next = new Date(day);
        next.setHours(start.getHours(), start.getMinutes(), 0, 0);
        setStart(next);
        setPicker(null);
    };

    const pickTime = (h: number, m: number) => {
        const next = new Date(start);
        next.setHours(h, m, 0, 0);
        setStart(next);
    };

    const handleCreate = async () => {
        if (!user) return;
        if (!venue?.name.trim()) {
            alert('Eksik Bilgi', 'Lütfen bir halısaha seç.', [], { type: 'error' });
            return;
        }
        if (start.getTime() <= Date.now()) {
            alert('Geçersiz Saat', 'Maç saati geçmiş bir zaman olamaz.', [], { type: 'error' });
            return;
        }
        // The monthly limit applies to one-off matches only.
        if (!groupId && !canCreateMatch) {
            alert('Aylık Maç Limiti Doldu', 'Ücretsiz hesapta ayda 1 tek seferlik maç oluşturabilirsin. Kaptan Pro ile sınırsız maç oluştur.', [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'Yükselt', onPress: () => router.push('/settings/premium') },
            ], { type: 'warning' });
            return;
        }
        setLoading(true);
        mediumHaptic();
        try {
            await createMatch(
                groupId,
                venue.name.trim(),
                start,
                Math.max(0, Number(price) || 0),
                user.uid,
                profileName || user.email?.split('@')[0] || 'Oyuncu',
                perTeam * 2,
                { duration: Number(duration) }
            );
            if (!groupId) await incrementMatchCount();
            successHaptic();
            alert('Maç Yayınlandı', groupId ? `${selectedGroup?.name || 'Grup'} üyelerine bildirim gönderildi.` : 'Maç oluşturuldu!', [], { type: 'success' });
            router.back();
        } catch (error: any) {
            console.error(error);
            alert('Hata', error?.message || 'Maç oluşturulamadı.', [], { type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const field = (label: string, value: string | null, placeholder: string, onPress: () => void, style?: object) => (
        <View style={[st.field, style]}>
            <Text style={[st.label, { color: C.textSecondary }]}>{label}</Text>
            <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[st.input, { backgroundColor: C.input, borderColor: C.border }]}>
                <Text style={[st.inputText, { color: value ? C.text : C.textTertiary }, !value && st.placeholder]} numberOfLines={1}>
                    {value || placeholder}
                </Text>
            </TouchableOpacity>
        </View>
    );

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <LinearGradient colors={[C.gradient[0], C.gradient[1]]} style={StyleSheet.absoluteFill} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView
                    contentContainerStyle={{ paddingHorizontal: 16, paddingTop: insets.top + 12, paddingBottom: 16 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    <TouchableOpacity onPress={() => router.back()} hitSlop={10} style={st.back}>
                        <Ionicons name="chevron-back" size={16} color={C.link} />
                        <Text style={[st.backText, { color: C.link }]}>Maçlarıma Dön</Text>
                    </TouchableOpacity>
                    <Text style={[st.title, { color: C.text }]}>Maç Oluştur</Text>
                    <Text style={[st.subtitle, { color: C.textSecondary }]}>Saha detaylarını belirle, maç davetini yayınla.</Text>

                    <View style={st.row}>
                        {field('Maç Tarihi', dayLabel(start, nowTs) ? `${dayLabel(start, nowTs)}, ${format(start, 'd MMM', { locale: tr })}` : format(start, 'd MMMM EEEE', { locale: tr }), 'Tarih seç', () => openPicker('date'), { flex: 1 })}
                        {field('Saat', `${format(start, 'HH:mm')} - ${format(end, 'HH:mm')}`, 'Saat seç', () => openPicker('time'), { flex: 1 })}
                    </View>

                    {field('Halısaha Seçimi', venue ? (venue.district ? `${venue.name}, ${venue.district}` : venue.name) : null, 'Saha ara veya adını yaz', openVenuePicker)}

                    <Eyebrow style={{ marginBottom: 10 }}>Oyuncu Formatı / Kapasite</Eyebrow>
                    <View style={[st.row, { marginBottom: 16 }]}>
                        {FORMATS.map(n => {
                            const on = n === perTeam;
                            return (
                                <TouchableOpacity
                                    key={n}
                                    onPress={() => setPerTeam(n)}
                                    activeOpacity={0.8}
                                    style={[st.format, { backgroundColor: on ? C.primary : C.card, borderColor: on ? C.primary : C.border }]}
                                    accessibilityRole="radio"
                                    accessibilityState={{ selected: on }}
                                >
                                    <Text style={[st.formatText, { color: on ? C.onPrimary : C.text }]}>{n}v{n} ({n * 2} Kişi)</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <TextField
                        label="Kişi Başı Ücret"
                        value={price}
                        onChangeText={t => setPrice(t.replace(/[^0-9]/g, ''))}
                        placeholder="Ücretsiz"
                        keyboardType="number-pad"
                        style={st.field}
                        right={<Text style={[st.currency, { color: C.textSecondary }]}>₺</Text>}
                    />

                    {field('Grup Seçimi (Opsiyonel)', selectedGroup?.name ?? (groupId ? 'Grup' : null), 'Grup seçilirse sadece o gruba bildirim gider', () => setPicker('group'))}
                </ScrollView>

                <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12 }}>
                    <PrimaryButton
                        label="Maçı Oluştur ve Yayınla"
                        onPress={handleCreate}
                        disabled={loading}
                        loading={loading ? <ActivityIndicator color={C.onPrimary} /> : undefined}
                    />
                </View>
            </KeyboardAvoidingView>

            {/* Date */}
            <Sheet visible={picker === 'date'} onClose={() => setPicker(null)} title="Maç Tarihi">
                <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
                    {days.map(d => {
                        const on = format(d, 'yyyy-MM-dd') === format(start, 'yyyy-MM-dd');
                        return (
                            <TouchableOpacity key={d.toISOString()} onPress={() => pickDay(d)} style={[st.option, { borderBottomColor: C.divider }]}>
                                <Text style={[st.optionText, { color: on ? C.link : C.text }, on && st.bold]}>
                                    {dayLabel(d, nowTs) ? `${dayLabel(d, nowTs)} · ` : ''}{format(d, 'd MMMM EEEE', { locale: tr })}
                                </Text>
                                {on && <Ionicons name="checkmark" size={18} color={C.link} />}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </Sheet>

            {/* Time */}
            <Sheet visible={picker === 'time'} onClose={() => setPicker(null)} title="Saat">
                <Eyebrow style={{ marginBottom: 8 }}>Süre</Eyebrow>
                <Segmented
                    options={DURATIONS.map(d => ({ key: d, label: `${d} dk` }))}
                    value={duration}
                    onChange={setDuration}
                />
                <Eyebrow style={{ marginTop: 14, marginBottom: 8 }}>Başlangıç</Eyebrow>
                <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
                    <View style={st.slots}>
                        {TIME_SLOTS.map(({ h, m }) => {
                            const slot = new Date(start);
                            slot.setHours(h, m, 0, 0);
                            const past = slot.getTime() <= nowTs;
                            const on = start.getHours() === h && start.getMinutes() === m;
                            return (
                                <TouchableOpacity
                                    key={`${h}:${m}`}
                                    disabled={past}
                                    onPress={() => pickTime(h, m)}
                                    style={[st.slot, { backgroundColor: on ? C.primary : C.card, borderColor: on ? C.primary : C.border }, past && st.dimmed]}
                                >
                                    <Text style={[st.slotText, { color: on ? C.onPrimary : C.text }]}>{format(slot, 'HH:mm')}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </ScrollView>
                <PrimaryButton label={`${format(start, 'HH:mm')} - ${format(end, 'HH:mm')} · Tamam`} onPress={() => setPicker(null)} style={{ marginTop: 12 }} />
            </Sheet>

            {/* Venue */}
            <Sheet visible={picker === 'venue'} onClose={() => setPicker(null)} title="Halısaha Seçimi">
                <TextField
                    value={venueQuery}
                    onChangeText={setVenueQuery}
                    placeholder={venueDistrict ? `${venueDistrict} içinde ara` : 'Saha veya ilçe ara'}
                    autoCorrect={false}
                    right={venueQuery ? (
                        <TouchableOpacity onPress={() => setVenueQuery('')} hitSlop={8} accessibilityLabel="Aramayı temizle">
                            <Ionicons name="close-circle" size={18} color={C.textTertiary} />
                        </TouchableOpacity>
                    ) : <Ionicons name="search" size={16} color={C.textTertiary} />}
                />

                <ScrollView
                    ref={chipScrollRef}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    style={st.chipScroll}
                    contentContainerStyle={st.chips}
                >
                    {[null, ...visibleDistricts].map(d => {
                        const on = venueDistrict === d;
                        const count = d ? districtCounts[d] || 0 : queryMatches.length;
                        return (
                            <TouchableOpacity
                                key={d ?? '__all'}
                                onPress={() => selectDistrict(d)}
                                onLayout={e => {
                                    if (!d) return;
                                    chipOffsets.current[d] = e.nativeEvent.layout.x;
                                    // Bring the preselected district into view when the sheet opens.
                                    if (on) chipScrollRef.current?.scrollTo({ x: Math.max(0, e.nativeEvent.layout.x - 16), animated: false });
                                }}
                                activeOpacity={0.8}
                                accessibilityRole="radio"
                                accessibilityState={{ selected: on }}
                                style={[st.chip, { backgroundColor: on ? C.primary : C.card, borderColor: on ? C.primary : C.border }]}
                            >
                                <Text style={[st.chipText, { color: on ? C.onPrimary : C.text }]}>{d ?? 'Tümü'}</Text>
                                <Text style={[st.chipCount, { color: on ? C.onPrimary : C.textTertiary }]}>{count}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>

                {!!venueQuery.trim() && (
                    <TouchableOpacity
                        onPress={() => { setVenue({ name: venueQuery.trim() }); setPicker(null); }}
                        style={[st.option, { borderBottomColor: C.divider }]}
                    >
                        <Ionicons name="create-outline" size={18} color={C.link} />
                        <Text style={[st.optionText, { color: C.link }, st.bold]} numberOfLines={1}>“{venueQuery.trim()}” adını kullan</Text>
                    </TouchableOpacity>
                )}
                <FlatList
                    style={{ flexShrink: 1 }}
                    data={venueResults}
                    keyExtractor={v => `${v.district}-${v.name}`}
                    keyboardShouldPersistTaps="handled"
                    initialNumToRender={20}
                    ListEmptyComponent={
                        venueDistrict && queryMatches.length > 0 ? (
                            <TouchableOpacity onPress={() => selectDistrict(null)} style={st.emptyAction}>
                                <Text style={[st.empty, { color: C.textTertiary, marginTop: 0 }]}>{venueDistrict} içinde sonuç yok.</Text>
                                <Text style={[st.emptyLink, { color: C.link }]}>Tüm ilçelerde {queryMatches.length} sonucu göster</Text>
                            </TouchableOpacity>
                        ) : (
                            <Text style={[st.empty, { color: C.textTertiary }]}>Listede bulunamadı. Yazdığın adı yukarıdan kullanabilirsin.</Text>
                        )
                    }
                    renderItem={({ item }) => {
                        const on = venue?.name === item.name && venue?.district === item.district;
                        return (
                            <TouchableOpacity onPress={() => { setVenue(item); setPicker(null); }} style={[st.option, { borderBottomColor: C.divider }]}>
                                <View style={{ flex: 1 }}>
                                    <Text style={[st.optionText, { color: on ? C.link : C.text }]} numberOfLines={1}>{item.name}</Text>
                                    {/* The district line is redundant once a district pill is active. */}
                                    {!venueDistrict && <Text style={[st.optionSub, { color: C.textSecondary }]}>{item.district}</Text>}
                                </View>
                                {on && <Ionicons name="checkmark" size={18} color={C.link} />}
                            </TouchableOpacity>
                        );
                    }}
                />
            </Sheet>

            {/* Group */}
            <Sheet visible={picker === 'group'} onClose={() => setPicker(null)} title="Grup Seçimi">
                <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
                    <TouchableOpacity onPress={() => { setGroupId(null); setPicker(null); }} style={[st.option, { borderBottomColor: C.divider }]}>
                        <View style={[st.noGroup, { backgroundColor: C.iconTile }]}>
                            <Ionicons name="person-outline" size={18} color={C.textSecondary} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[st.optionText, { color: C.text }]}>Grup yok</Text>
                            <Text style={[st.optionSub, { color: C.textSecondary }]}>Tek seferlik maç olarak oluşturulur</Text>
                        </View>
                        {!groupId && <Ionicons name="checkmark" size={18} color={C.link} />}
                    </TouchableOpacity>
                    {groups.map(g => {
                        const admin = isAdminOf(g);
                        const on = g.id === groupId;
                        return (
                            <TouchableOpacity
                                key={g.id}
                                disabled={!admin}
                                onPress={() => { setGroupId(g.id); setPicker(null); }}
                                style={[st.option, { borderBottomColor: C.divider }, !admin && st.dimmed]}
                            >
                                <Avatar uri={g.photoURL} name={g.name} size={36} radius={10} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[st.optionText, { color: on ? C.link : C.text }]} numberOfLines={1}>{g.name}</Text>
                                    <Text style={[st.optionSub, { color: C.textSecondary }]}>
                                        {admin ? `${g.members?.length || 0} üye · bildirim gruba gider` : 'Sadece yöneticiler maç oluşturabilir'}
                                    </Text>
                                </View>
                                {on && <Ionicons name="checkmark" size={18} color={C.link} />}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
                {groups.length > 0 && !groups.some(isAdminOf) && (
                    <Text style={[st.empty, { color: C.textTertiary, backgroundColor: withOpacity(C.warning, 0.08) }]}>
                        Yöneticisi olduğun bir grup yok; maç tek seferlik oluşturulacak.
                    </Text>
                )}
            </Sheet>
        </View>
    );
}

const st = StyleSheet.create({
    bold: { fontWeight: '800' },
    dimmed: { opacity: 0.45 },
    back: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12, alignSelf: 'flex-start' },
    backText: { fontSize: 13, fontWeight: '700' },
    title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, marginBottom: 6 },
    subtitle: { fontSize: 13.5, fontWeight: '600', marginBottom: 20 },

    row: { flexDirection: 'row', gap: 10 },
    field: { marginBottom: 14 },
    label: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7 },
    input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, minHeight: 50, justifyContent: 'center' },
    inputText: { fontSize: 15 },
    placeholder: { fontSize: 13 },
    currency: { fontSize: 15, fontWeight: '700' },

    format: { flex: 1, borderWidth: 1, borderRadius: 16, paddingVertical: 12, paddingHorizontal: 4, alignItems: 'center' },
    formatText: { fontSize: 13, fontWeight: '800' },

    option: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
    optionText: { flex: 1, fontSize: 15 },
    optionSub: { fontSize: 12, marginTop: 1 },
    noGroup: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    empty: { fontSize: 12.5, textAlign: 'center', padding: 14, borderRadius: 12, marginTop: 8 },
    emptyAction: { alignItems: 'center', paddingVertical: 12 },
    emptyLink: { fontSize: 13, fontWeight: '800' },

    chipScroll: { flexGrow: 0, marginTop: 10, marginHorizontal: -16 },
    chips: { gap: 8, paddingHorizontal: 16, paddingBottom: 4 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 34, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1 },
    chipText: { fontSize: 13, fontWeight: '700' },
    chipCount: { fontSize: 11.5, fontWeight: '700' },

    slots: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    slot: { width: '23%', flexGrow: 1, borderWidth: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
    slotText: { fontSize: 14, fontWeight: '700' },
});
