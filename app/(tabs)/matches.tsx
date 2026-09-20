import { Ionicons } from '@expo/vector-icons';
import { differenceInHours, format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Eyebrow, Pill, Segmented, TextField, toDate } from '../../components/group/GroupUI';
import { ON_PITCH, ON_PITCH_MUTED, PitchCard, PitchPill, formatLabel, matchDayLabel } from '../../components/match/MatchUI';
import NetworkError from '../../components/NetworkError';
import { useSettingsColors } from '../../components/settings/SettingsUI';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { SwipePager } from '../../components/ui/SwipePager';
import { withOpacity } from '../../constants/designTokens';
import { useAuth } from '../../context/AuthContext';
import { getUserMatches } from '../../services/firestore';

/** Layout: design/tasarım/macvar-match-flow.html (Maçlarım); colors from designTokens. */

type Tab = 'upcoming' | 'past';
const TABS: Tab[] = ['upcoming', 'past'];
const TAB_BAR_HEIGHT = 68; // keep in sync with app/(tabs)/_layout.tsx

const resultOf = (m: any): 'win' | 'loss' | 'draw' | null => {
    if (m.scoreA === undefined || m.scoreB === undefined) return null;
    if (m.scoreA === m.scoreB) return 'draw';
    if (m.playerStats?.won !== undefined) return m.playerStats.won ? 'win' : 'loss';
    const team = m.playerStats?.team;
    if (team === 'A') return m.scoreA > m.scoreB ? 'win' : 'loss';
    if (team === 'B') return m.scoreB > m.scoreA ? 'win' : 'loss';
    return null;
};

export default function MatchesScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    const [matches, setMatches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState(false);
    const [tab, setTab] = useState<Tab>('upcoming');
    // Follows the horizontal swipe so the segmented pill slides with the finger.
    const tabProgress = useSharedValue(0);
    const [search, setSearch] = useState('');
    const [now, setNow] = useState(() => Date.now());

    const load = async () => {
        if (!user) return;
        try {
            setMatches(await getUserMatches(user.uid));
            setNow(Date.now());
            setError(false);
        } catch (err) {
            console.error('Error fetching matches:', err);
            setError(true);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            load();
        }, [user])
    );

    const isPast = (m: any) => m.status === 'FINISHED' || toDate(m.date).getTime() < now;
    const upcoming = matches.filter(m => !isPast(m)).sort((a, b) => toDate(a.date).getTime() - toDate(b.date).getTime());
    const past = matches.filter(isPast).sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());
    const q = search.trim().toLocaleLowerCase('tr-TR');
    const pastFiltered = q
        ? past.filter(m => `${m.venue || ''} ${m.groupName || ''}`.toLocaleLowerCase('tr-TR').includes(q))
        : past;
    const lastResult = past.find(m => m.status === 'FINISHED' && resultOf(m) !== null);

    const tabBarTop = (insets.bottom > 0 ? insets.bottom + 8 : 16) + TAB_BAR_HEIGHT;
    const openMatch = (m: any) => router.push(`/match/${m.id}`);

    /* ─────────────────────────── Cards ─────────────────────────── */

    const countdown = (date: Date) => {
        const hours = differenceInHours(date, now);
        if (hours < 1) return 'Başlamak üzere';
        if (hours < 24) return `Son ${hours} saat`;
        return `${Math.floor(hours / 24)} gün kaldı`;
    };

    const meta = (m: any) => [m.groupName, formatLabel(m.maxPlayers)].filter(Boolean).join(' · ');

    const renderNext = (m: any) => {
        const date = toDate(m.date);
        const count = m.playerCount || 0;
        const max = m.maxPlayers || 14;
        return (
            <TouchableOpacity activeOpacity={0.85} onPress={() => openMatch(m)}>
                <PitchCard style={st.nextCard}>
                    <View style={st.rowBetween}>
                        <PitchPill label={`${count}/${max} OYUNCU`} />
                        <PitchPill label={matchDayLabel(date, new Date(now))} />
                    </View>
                    <View style={{ marginTop: 'auto' }}>
                        <Text style={[st.nextName, { color: ON_PITCH }]} numberOfLines={1}>{m.venue || 'Maç'}</Text>
                        <Text style={[st.nextMeta, { color: ON_PITCH_MUTED }]} numberOfLines={1}>{meta(m)}</Text>
                        <View style={[st.rowBetween, { marginTop: 12 }]}>
                            <PitchPill label={countdown(date)} />
                            {m.feePerPerson > 0 && <Text style={[st.fee, { color: ON_PITCH }]}>₺{m.feePerPerson} / kişi</Text>}
                        </View>
                    </View>
                </PitchCard>
            </TouchableOpacity>
        );
    };

    const renderUpcoming = (m: any) => {
        const count = m.playerCount || 0;
        const max = m.maxPlayers || 14;
        const full = count >= max;
        return (
            <TouchableOpacity activeOpacity={0.8} onPress={() => openMatch(m)} style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={st.rowBetween}>
                    <Pill label={full ? `KADRO TAM (${count}/${max})` : `${count}/${max} OYUNCU`} color={full ? C.link : undefined} />
                    <Pill label={matchDayLabel(toDate(m.date), new Date(now))} />
                </View>
                <Text style={[st.cardName, { color: C.text }]} numberOfLines={1}>{m.venue || 'Maç'}</Text>
                <Text style={[st.cardMeta, { color: C.textSecondary }]} numberOfLines={1}>{meta(m)}</Text>
                {(!full || m.feePerPerson > 0) && (
                    <View style={[st.rowBetween, { marginTop: 10 }]}>
                        {!full ? <Text style={[st.status, { color: C.gold }]}>Kadro Bekleniyor</Text> : <View />}
                        {m.feePerPerson > 0 && <Text style={[st.feeSmall, { color: C.text }]}>₺{m.feePerPerson} / kişi</Text>}
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    // Past cards mirror the upcoming ones: the latest match gets the pitch card, older ones the simple card.
    const pastInfo = (m: any) => {
        const result = resultOf(m);
        const hasScore = m.status === 'FINISHED' && m.scoreA !== undefined && m.scoreB !== undefined;
        const ps = m.playerStats || {};
        return {
            hasScore,
            label: hasScore
                ? (result === 'win' ? 'GALİBİYET' : result === 'loss' ? 'MAĞLUBİYET' : result === 'draw' ? 'BERABERE' : 'MAÇ BİTTİ')
                : 'SKOR BEKLENİYOR',
            color: result === 'win' ? C.link : result === 'loss' ? C.error : result === 'draw' ? C.warning : hasScore ? undefined : C.warning,
            date: format(toDate(m.date), 'd MMM · HH:mm', { locale: tr }).toLocaleUpperCase('tr-TR'),
            score: hasScore ? `${m.scoreA} – ${m.scoreB}` : null,
            mine: ps.team ? `${ps.goals || 0} Gol · ${ps.assists || 0} Asist${ps.isMotm ? ' · MVP' : ''}` : null,
        };
    };

    const renderPastFeatured = (m: any) => {
        const info = pastInfo(m);
        return (
            <TouchableOpacity activeOpacity={0.85} onPress={() => openMatch(m)}>
                <PitchCard style={st.nextCard}>
                    <View style={st.rowBetween}>
                        <PitchPill label={info.label} />
                        <PitchPill label={info.date} />
                    </View>
                    <View style={{ marginTop: 'auto' }}>
                        <Text style={[st.nextName, { color: ON_PITCH }]} numberOfLines={1}>{m.venue || 'Maç'}</Text>
                        <Text style={[st.nextMeta, { color: ON_PITCH_MUTED }]} numberOfLines={1}>{meta(m)}</Text>
                        <View style={[st.rowBetween, { marginTop: 12 }]}>
                            <PitchPill label={info.mine ?? (info.hasScore ? 'Maç bitti' : 'Skor girilmedi')} />
                            {info.score
                                ? <Text style={[st.pitchScore, { color: ON_PITCH }]}>{info.score}</Text>
                                : <Text style={[st.fee, { color: ON_PITCH }]}>Skor Gir ›</Text>}
                        </View>
                    </View>
                </PitchCard>
            </TouchableOpacity>
        );
    };

    const renderPast = (m: any) => {
        const info = pastInfo(m);
        return (
            <TouchableOpacity activeOpacity={0.8} onPress={() => openMatch(m)} style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                <View style={st.rowBetween}>
                    <Pill label={info.label} color={info.color} />
                    <Pill label={info.date} />
                </View>
                <Text style={[st.cardName, { color: C.text }]} numberOfLines={1}>{m.venue || 'Maç'}</Text>
                <Text style={[st.cardMeta, { color: C.textSecondary }]} numberOfLines={1}>{meta(m)}</Text>
                <View style={[st.rowBetween, { marginTop: 10 }]}>
                    {info.mine
                        ? <Text style={[st.status, { color: C.gold }]}>{info.mine}</Text>
                        : <Text style={[st.status, { color: C.textTertiary }]}>{info.hasScore ? 'Kadroda değildin' : 'Skor girilmedi'}</Text>}
                    {info.score
                        ? <View style={[st.score, { backgroundColor: info.color ? withOpacity(info.color, 0.15) : C.iconTile }]}>
                            <Text style={[st.scoreText, { color: info.color ?? C.text }]}>{info.score}</Text>
                        </View>
                        : <Text style={[st.feeSmall, { color: C.warning }]}>Skor Gir ›</Text>}
                </View>
            </TouchableOpacity>
        );
    };

    const renderLastResult = () => {
        if (!lastResult) return null;
        const myTeam = lastResult.playerStats?.team;
        const teamA = lastResult.customizations?.teamAName || 'Takım A';
        const teamB = lastResult.customizations?.teamBName || 'Takım B';
        const mine = myTeam === 'B' ? teamB : teamA;
        const other = myTeam === 'B' ? teamA : teamB;
        const myScore = myTeam === 'B' ? lastResult.scoreB : lastResult.scoreA;
        const otherScore = myTeam === 'B' ? lastResult.scoreA : lastResult.scoreB;
        const ps = lastResult.playerStats || {};
        return (
            <View style={{ marginTop: 6, gap: 8 }}>
                <Eyebrow>Son Maçınız</Eyebrow>
                <TouchableOpacity activeOpacity={0.8} onPress={() => openMatch(lastResult)} style={[st.card, st.resultCard, { backgroundColor: C.card, borderColor: C.border }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={[st.resultTeam, { color: C.text }]} numberOfLines={1}>{mine}{myTeam ? ' (Biz)' : ''}</Text>
                        <View style={[st.row, { marginTop: 8, gap: 8 }]}>
                            <Avatar uri={user?.photoURL ?? undefined} name={user?.displayName ?? undefined} size={26} />
                            <View>
                                <Text style={[st.resultName, { color: C.text }]} numberOfLines={1}>
                                    {lastResult.venue || 'Maç'}{ps.isMotm ? ' (MVP)' : ''}
                                </Text>
                                <Text style={[st.resultSub, { color: C.gold }]}>
                                    {ps.goals || 0} Gol · {ps.assists || 0} Asist
                                </Text>
                            </View>
                        </View>
                    </View>
                    <View style={{ alignItems: 'center' }}>
                        <View style={[st.score, { backgroundColor: C.iconTile }]}>
                            <Text style={[st.scoreBig, { color: C.text }]}>{myScore} – {otherScore}</Text>
                        </View>
                        <Text style={[st.resultSub, { color: C.textSecondary, marginTop: 6 }]} numberOfLines={1}>{other}</Text>
                    </View>
                </TouchableOpacity>
            </View>
        );
    };

    const empty = (title: string, text: string) => (
        <View style={st.empty}>
            <View style={[st.emptyIcon, { backgroundColor: C.iconTile }]}>
                <Ionicons name="football-outline" size={30} color={C.textSecondary} />
            </View>
            <Text style={[st.emptyTitle, { color: C.text }]}>{title}</Text>
            <Text style={[st.emptyText, { color: C.textSecondary }]}>{text}</Text>
        </View>
    );

    /* ─────────────────────────── Render ─────────────────────────── */

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <LinearGradient colors={[C.gradient[0], C.gradient[1]]} style={StyleSheet.absoluteFill} />

            <View style={[st.header, { paddingTop: insets.top + 8 }]}>
                <Text style={[st.title, { color: C.text }]}>Maçlarım</Text>
                <View style={st.headerActions}>
                    <TouchableOpacity
                        onPress={() => router.push('/notifications')}
                        style={[st.roundBtn, { backgroundColor: C.card, borderColor: C.border }]}
                        accessibilityLabel="Bildirimler"
                    >
                        <Ionicons name="notifications-outline" size={20} color={C.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => router.push('/create-match')}
                        style={[st.roundBtn, { backgroundColor: C.primary, borderColor: C.primary }]}
                        accessibilityLabel="Yeni maç oluştur"
                    >
                        <Ionicons name="add" size={24} color={C.onPrimary} />
                    </TouchableOpacity>
                </View>
            </View>

            <View style={{ paddingHorizontal: 16, marginBottom: 14 }}>
                <Segmented<Tab>
                    options={[{ key: 'upcoming', label: 'Yaklaşanlar' }, { key: 'past', label: 'Geçmiş Maçlar' }]}
                    value={tab}
                    onChange={setTab}
                    progress={tabProgress}
                />
            </View>

            {error && !loading ? (
                <NetworkError message="Maçlar yüklenirken bir hata oluştu. İnternet bağlantınızı kontrol edin." onRetry={() => { setLoading(true); load(); }} isDark={C.isDark} />
            ) : loading ? (
                <View style={{ paddingHorizontal: 16, gap: 14 }}>
                    <SkeletonLoader height={140} borderRadius={20} />
                    <SkeletonLoader height={110} borderRadius={20} />
                    <SkeletonLoader height={110} borderRadius={20} />
                </View>
            ) : (
                <SwipePager
                    index={TABS.indexOf(tab)}
                    onIndexChange={i => setTab(TABS[i])}
                    progress={tabProgress}
                    pages={[
                <FlatList
                    key="upcoming"
                    data={upcoming}
                    keyExtractor={m => m.id}
                    renderItem={({ item, index }) => (index === 0 ? renderNext(item) : renderUpcoming(item))}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarTop + 16, gap: 14, flexGrow: 1 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primaryText} />}
                    ListEmptyComponent={empty('Yaklaşan maç yok', 'Sağ üstteki + ile yeni bir maç oluştur ya da bir gruba katıl.')}
                    ListFooterComponent={renderLastResult()}
                />,
                <FlatList
                    key="past"
                    data={pastFiltered}
                    keyExtractor={m => m.id}
                    renderItem={({ item, index }) => (index === 0 ? renderPastFeatured(item) : renderPast(item))}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarTop + 16, gap: 12, flexGrow: 1 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={C.primaryText} />}
                    ListHeaderComponent={
                        past.length > 0 ? (
                            <TextField
                                value={search}
                                onChangeText={setSearch}
                                placeholder="Saha veya grup adı ara"
                                returnKeyType="search"
                                right={search ? (
                                    <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}>
                                        <Ionicons name="close-circle" size={18} color={C.textTertiary} />
                                    </TouchableOpacity>
                                ) : <Ionicons name="search" size={18} color={C.textTertiary} />}
                            />
                        ) : null
                    }
                    ListEmptyComponent={q ? empty('Sonuç yok', 'Aramana uyan geçmiş maç bulunamadı.') : empty('Geçmiş maç yok', 'Oynadığın maçlar burada listelenecek.')}
                />,
                    ]}
                />
            )}

        </View>
    );
}

const st = StyleSheet.create({
    row: { flexDirection: 'row', alignItems: 'center' },
    rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16 },
    title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    roundBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

    nextCard: { minHeight: 150 },
    nextName: { fontSize: 19, fontWeight: '800', marginTop: 6 },
    nextMeta: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    fee: { fontSize: 15, fontWeight: '800' },

    card: { borderRadius: 20, borderWidth: 1, padding: 16 },
    cardName: { fontSize: 16, fontWeight: '800', marginTop: 8 },
    cardMeta: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    status: { fontSize: 12, fontWeight: '700' },
    feeSmall: { fontSize: 14, fontWeight: '800' },

    pitchScore: { fontSize: 22, fontWeight: '900' },
    score: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 10 },
    scoreText: { fontSize: 15, fontWeight: '800' },
    scoreBig: { fontSize: 17, fontWeight: '800' },

    resultCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    resultTeam: { fontSize: 13, fontWeight: '700' },
    resultName: { fontSize: 12.5, fontWeight: '700', maxWidth: 180 },
    resultSub: { fontSize: 10.5, fontWeight: '700' },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 48, gap: 8 },
    emptyIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyTitle: { fontSize: 17, fontWeight: '800' },
    emptyText: { fontSize: 13, fontWeight: '500', textAlign: 'center', maxWidth: 260 },

});
