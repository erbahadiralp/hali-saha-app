import { Ionicons } from '@expo/vector-icons';
import { differenceInHours, format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Share, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AdBanner } from '../../../components/AdBanner';
import { useAlert } from '../../../components/CustomAlertProvider';
import { Avatar, Eyebrow, Pill, PrimaryButton, SecondaryButton, Segmented, Sheet, TextField, compactName, formatTL, toDate } from '../../../components/group/GroupUI';
import { FormationPitch, ON_PITCH, ON_PITCH_MUTED, PitchCard, PitchPill, formatLabel, matchDayLabel, ratingColor } from '../../../components/match/MatchUI';
import { useSettingsColors } from '../../../components/settings/SettingsUI';
import { withOpacity } from '../../../constants/designTokens';
import { useAuth } from '../../../context/AuthContext';
import { usePremium } from '../../../context/PremiumContext';
import { deleteMatch, getGroupDetails, getMatchDetails, getMatchParticipants, getMutualFollowers, getUserProfile, isAdminOfGroup, isMatchFullError, joinGroup, joinMatch, requestToJoinGroup, searchUserByEmail, searchUsersByUsername, sendMatchInvite } from '../../../services/firestore';
import { getGroupPlayerRating } from '../../../services/groupService';
import { scheduleMatchReminders } from '../../../services/notificationSettings';
import { matchRating, resolveOverall } from '../../../services/playerStats';

/** Layout: design/tasarım/macvar-match-flow.html (Maç Detayı); colors from designTokens. */

type Status = 'IN' | 'OUT' | 'MAYBE' | 'WAITLIST';
type SheetKind = 'invite' | 'guest' | null;

const isGuest = (userId?: string) => !userId || userId.startsWith('guest_');

export default function MatchDetailsScreen() {
    const { alert } = useAlert();
    const { id, exp } = useLocalSearchParams<{ id: string; exp?: string }>();
    const { user } = useAuth();
    const { canManageDebts, canCustomizeMatch } = usePremium();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const C = useSettingsColors();
    const { width: screenW } = useWindowDimensions();

    const [match, setMatch] = useState<any>(null);
    const [group, setGroup] = useState<any>(null);
    const [participants, setParticipants] = useState<any[]>([]);
    const [myStatus, setMyStatus] = useState<Status | null>(null);
    const [isAdmin, setIsAdmin] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [joining, setJoining] = useState(false);
    const [now, setNow] = useState(() => Date.now());
    const loadedRef = useRef(false);

    const [rosterView, setRosterView] = useState<'list' | 'pitch'>('list');
    const [sheet, setSheet] = useState<SheetKind>(null);
    const [guestName, setGuestName] = useState('');
    const [isLinkExpired, setIsLinkExpired] = useState(false);

    const [loadingMutuals, setLoadingMutuals] = useState(false);
    const [allMutuals, setAllMutuals] = useState<any[]>([]);
    const [inviteResults, setInviteResults] = useState<any[]>([]);
    const [inviteQuery, setInviteQuery] = useState('');
    const [inviteSending, setInviteSending] = useState<string | null>(null);

    useEffect(() => {
        if (!exp) return;
        const expTime = parseInt(exp, 10);
        if (!isNaN(expTime) && Date.now() > expTime) {
            setIsLinkExpired(true);
            alert('Davet Süresi Doldu', 'Bu davet linkinin süresi dolmuş.', [], { type: 'warning' });
        }
    }, [exp]);

    const fetchMatchData = useCallback(async () => {
        if (!id) return;
        try {
            if (!loadedRef.current) setLoading(true);
            const matchData: any = await getMatchDetails(id);
            setMatch(matchData);
            setNow(Date.now());
            if (!matchData) return;

            let admin = !!user && matchData.creatorId === user.uid;
            if (matchData.groupId) {
                const groupData: any = await getGroupDetails(matchData.groupId);
                setGroup(groupData);
                if (isAdminOfGroup(groupData, user?.uid)) admin = true;
            }
            setIsAdmin(admin);

            const participantsData: any[] = await getMatchParticipants(id);
            const enriched = await Promise.all(participantsData.map(async p => {
                if (isGuest(p.userId)) return { ...p, photoURL: null, rating: 50 };
                try {
                    const profile: any = await getUserProfile(p.userId);
                    let rating = profile ? resolveOverall(profile) : 50;
                    if (matchData.groupId && profile) {
                        const groupRating = await getGroupPlayerRating(matchData.groupId, p.userId);
                        rating = matchRating(profile, groupRating?.rating);
                    }
                    return { ...p, photoURL: profile?.photoURL || null, rating };
                } catch {
                    return { ...p, photoURL: null, rating: 50 };
                }
            }));
            setParticipants(enriched);
            if (user) setMyStatus((participantsData.find(p => p.userId === user.uid)?.status as Status) ?? null);
            loadedRef.current = true;
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [id, user]);

    useFocusEffect(
        useCallback(() => {
            fetchMatchData();
        }, [fetchMatchData])
    );

    /* ─────────────────────────── Actions ─────────────────────────── */

    const handleJoin = async (status: Status) => {
        if (isLinkExpired) {
            alert('Davet Süresi Doldu', 'Bu davet linkinin süresi dolmuş, işlem yapamazsın.', [], { type: 'warning' });
            return;
        }
        if (!user || !id || !match) return;
        setJoining(true);
        const previous = myStatus;
        setMyStatus(status);
        try {
            const profile: any = await getUserProfile(user.uid);
            await joinMatch(id, user.uid, profile?.displayName || user.email?.split('@')[0] || 'Oyuncu', status);
            await fetchMatchData();
            const date = toDate(match.date);
            if (status === 'IN' && date > new Date()) {
                await scheduleMatchReminders(id, match.venue || 'Maç', date);
            } else if (status === 'OUT') {
                const { cancelMatchReminders } = await import('../../../services/pushNotifications');
                await cancelMatchReminders(id);
            }
        } catch (error: any) {
            setMyStatus(previous);
            if (isMatchFullError(error)) {
                alert('Maç Dolu', 'Kadroda yer kalmadı. Yedeklere geçersen yer açıldığında otomatik olarak kadroya alınırsın.', [
                    { text: 'Vazgeç', style: 'cancel' },
                    { text: 'Yedeğe Geç', onPress: () => handleJoin('WAITLIST') },
                ], { type: 'warning' });
            } else {
                alert('Hata', 'Durum güncellenemedi. Tekrar dene.', [], { type: 'error' });
            }
        } finally {
            setJoining(false);
        }
    };

    const handleShare = async () => {
        try {
            const expiration = Date.now() + 24 * 60 * 60 * 1000;
            const dateStr = match?.date ? format(toDate(match.date), 'dd MMM HH:mm', { locale: tr }) : '';
            await Share.share({ message: `Halısaha maçına davetlisin! ${match?.venue || 'Maç'} @ ${dateStr}: halisahaapp://match/${id}?exp=${expiration}` });
        } catch (error) {
            console.log(error);
        }
    };

    const handleDeleteMatch = () => {
        alert(
            'Maçı İptal Et',
            'Bu maçı silmek istediğine emin misin? Bu işlem geri alınamaz.',
            [
                { text: 'Vazgeç', style: 'cancel' },
                {
                    text: 'Maçı Sil',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteMatch(id);
                            router.replace('/(tabs)/matches');
                        } catch (error) {
                            console.error(error);
                            alert('Hata', 'Maç silinemedi.', [], { type: 'error' });
                        }
                    },
                },
            ],
            { type: 'warning' }
        );
    };

    const handleAddGuest = async () => {
        const name = guestName.trim();
        if (!name) {
            alert('Hata', 'Misafir ismi boş olamaz', [], { type: 'error' });
            return;
        }
        try {
            const guestId = `guest_${Math.random().toString(36).substring(2, 10)}_${Date.now()}`;
            await joinMatch(id, guestId, `${name} (Misafir)`, 'IN');
            setGuestName('');
            setSheet(null);
            await fetchMatchData();
        } catch (error) {
            console.error(error);
            alert('Hata', isMatchFullError(error) ? 'Maç dolu, misafir eklenemez.' : 'Misafir eklenemedi', [], { type: 'error' });
        }
    };

    const openInvite = () => {
        setInviteQuery('');
        setSheet('invite');
        if (!user) return;
        setLoadingMutuals(true);
        getMutualFollowers(user.uid)
            .then(users => {
                const ids = participants.map(p => p.userId);
                const filtered = users.filter((u: any) => !ids.includes(u.uid));
                setAllMutuals(filtered);
                setInviteResults(filtered);
            })
            .catch(console.error)
            .finally(() => setLoadingMutuals(false));
    };

    const filterMutuals = (text: string) => {
        setInviteQuery(text);
        const lower = text.trim().toLocaleLowerCase('tr-TR');
        setInviteResults(lower
            ? allMutuals.filter(u => `${u.displayName || ''} ${u.username || ''}`.toLocaleLowerCase('tr-TR').includes(lower))
            : allMutuals);
    };

    const handleGlobalSearch = async () => {
        const q = inviteQuery.trim();
        if (!q) return;
        setLoadingMutuals(true);
        try {
            const [byUsername, byEmail] = await Promise.all([searchUsersByUsername(q), searchUserByEmail(q)]);
            const combined = [...inviteResults];
            [...byUsername, byEmail].filter(Boolean).forEach((u: any) => {
                if (!combined.some(c => c.uid === u.uid)) combined.push(u);
            });
            const ids = participants.map(p => p.userId);
            setInviteResults(combined.filter(u => !ids.includes(u.uid)));
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingMutuals(false);
        }
    };

    const handleSendInvite = async (target: any) => {
        if (!user || !match) return;
        setInviteSending(target.uid);
        try {
            const profile: any = await getUserProfile(user.uid);
            const matchName = `${match.venue} (${format(toDate(match.date), 'dd MMM HH:mm', { locale: tr })})`;
            await sendMatchInvite(id, matchName, user.uid, profile?.displayName || 'Bir kullanıcı', target.uid);
            setInviteResults(prev => prev.filter(u => u.uid !== target.uid));
            alert('Davet Gönderildi', `${target.displayName || target.username} kullanıcısına davet gönderildi`, [], { type: 'success' });
        } catch (error: any) {
            alert('Hata', error.message || 'Davet gönderilemedi', [], { type: 'error' });
        } finally {
            setInviteSending(null);
        }
    };

    const handleJoinGroup = async () => {
        if (!match?.groupId || !user) return;
        try {
            if (group?.privacy === 'private') {
                await requestToJoinGroup(match.groupId, user.uid);
                alert('İstek Gönderildi', 'Katılım isteğin yöneticiye iletildi.', [], { type: 'success' });
            } else {
                await joinGroup(match.groupId, user.uid);
                setGroup(await getGroupDetails(match.groupId));
                alert('Başarılı', 'Gruba katıldın!', [], { type: 'success' });
            }
        } catch (e) {
            console.error(e);
            alert('Hata', 'İşlem gerçekleştirilemedi.', [], { type: 'error' });
        }
    };

    const openPostMatch = () => {
        const date = toDate(match.date);
        const finishedAt = match.finishedAt ? toDate(match.finishedAt) : new Date(date.getTime() + 90 * 60 * 1000);
        if (match.status !== 'FINISHED' && Date.now() > finishedAt.getTime() + 10 * 60 * 1000) {
            alert('Süre Doldu', 'İstatistik giriş süresi doldu.', [], { type: 'warning' });
            return;
        }
        router.push(`/match/${id}/post-match`);
    };

    const proGate = (allowed: boolean, message: string, go: () => void) => {
        if (allowed) go();
        else alert('Kaptan Pro', message, [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Planları Gör', onPress: () => router.push('/settings/premium') },
        ]);
    };

    /* ─────────────────────────── Loading ─────────────────────────── */

    const background = <LinearGradient colors={[C.gradient[0], C.gradient[1]]} style={StyleSheet.absoluteFill} />;
    const backButton = (
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityLabel="Geri" style={st.rowCenter}>
            <Ionicons name="chevron-back" size={24} color={C.text} />
            <Text style={[st.headerTitle, { color: C.text }]}>Maç Detayı</Text>
        </TouchableOpacity>
    );

    if (loading || !match) {
        return (
            <View style={{ flex: 1, backgroundColor: C.background }}>
                {background}
                <View style={[st.header, { paddingTop: insets.top + 8 }]}>{backButton}</View>
                <View style={st.center}>
                    {loading ? <ActivityIndicator size="large" color={C.primaryText} /> : <Text style={{ color: C.textSecondary }}>Maç bulunamadı veya iptal edildi</Text>}
                </View>
            </View>
        );
    }

    /* ─────────────────────────── Derived ─────────────────────────── */

    const date = toDate(match.date);
    const isFinished = match.status === 'FINISHED';
    const isPast = now > date.getTime();
    const maxPlayers = match.maxPlayers || 14;
    const teamAName = match.customizations?.teamAName || match.teamAName || 'Takım A';
    const teamBName = match.customizations?.teamBName || match.teamBName || 'Takım B';
    const hasScore = isFinished && match.scoreA !== undefined && match.scoreB !== undefined;

    // A team assignment implies the player is in, whatever the status says.
    const confirmed = participants.filter(p => p.status === 'IN' || p.team === 'A' || p.team === 'B');
    const maybe = participants.filter(p => p.status === 'MAYBE' && !p.team);
    const waitlist = participants
        .filter(p => p.status === 'WAITLIST' && !p.team)
        .sort((a, b) => (a.updatedAt?.seconds || 0) - (b.updatedAt?.seconds || 0));

    const assigned = confirmed.some(p => p.team === 'A' || p.team === 'B');
    const byIndex = (a: any, b: any) => (a.teamIndex ?? 99) - (b.teamIndex ?? 99);
    const teamA = assigned ? confirmed.filter(p => p.team === 'A').sort(byIndex) : confirmed.slice(0, Math.ceil(confirmed.length / 2));
    const teamB = assigned ? confirmed.filter(p => p.team === 'B').sort(byIndex) : confirmed.slice(Math.ceil(confirmed.length / 2));
    if (assigned) {
        // Players promoted from the waitlist without a team fill the smaller side for display.
        confirmed.filter(p => p.team !== 'A' && p.team !== 'B').forEach(p => (teamA.length <= teamB.length ? teamA : teamB).push(p));
    }
    const isFull = confirmed.length >= maxPlayers;

    const statusPill = isFinished
        ? { label: 'BİTTİ', color: C.textSecondary }
        : isPast
            ? { label: 'SAATİ GEÇTİ', color: C.warning }
            : isFull
                ? { label: 'KADRO TAM', color: C.link }
                : { label: `${confirmed.length}/${maxPlayers}`, color: C.warning };

    const heroTag = isFinished
        ? hasScore ? (match.scoreA === match.scoreB ? 'Berabere bitti' : `${match.scoreA > match.scoreB ? teamAName : teamBName} kazandı`) : 'Maç bitti'
        : isPast ? 'Maç saati geçti' : (() => {
            const hours = differenceInHours(date, now);
            return hours < 1 ? 'Başlamak üzere' : hours < 24 ? `⏱ Son ${hours} saat` : `${Math.floor(hours / 24)} gün kaldı`;
        })();

    const heroMeta = [
        matchDayLabel(date, new Date(now)),
        group?.name,
        formatLabel(maxPlayers),
        match.duration ? `${match.duration} dk` : null,
    ].filter(Boolean).join(' · ');

    /* ─────────────────────────── Pieces ─────────────────────────── */

    const playerRow = (p: any, i: number) => (
        <TouchableOpacity
            key={p.userId || i}
            disabled={isGuest(p.userId)}
            onPress={() => router.push(`/user/${p.userId}${match.groupId ? `?groupId=${match.groupId}` : ''}` as any)}
            style={st.rosterItem}
            activeOpacity={0.7}
        >
            <Avatar uri={p.photoURL} name={p.name} size={24} />
            <Text style={[st.rosterName, { color: C.text }]} numberOfLines={1}>{compactName(p.name)}</Text>
            <Text style={[st.rosterRating, { color: ratingColor(C, p.rating || 50) }]}>{p.rating || 50}</Text>
        </TouchableOpacity>
    );

    const rosterColumn = (players: any[], name: string, color: string) => (
        <View style={{ flex: 1 }}>
            <View style={st.rosterHead}>
                <Text style={[st.rosterTeam, { color }]} numberOfLines={1}>{name.toLocaleUpperCase('tr-TR')}</Text>
                <Text style={[st.rosterCount, { color: C.textTertiary }]}>{players.length} Oyuncu</Text>
            </View>
            {players.length === 0
                ? <Text style={[st.muted, { color: C.textTertiary }]}>Henüz oyuncu yok</Text>
                : players.map(playerRow)}
        </View>
    );

    const choice = (status: Status, label: string, activeColor: string, filled?: boolean) => {
        const active = myStatus === status;
        const disabledFull = status === 'IN' && isFull && myStatus !== 'IN';
        return (
            <TouchableOpacity
                key={status}
                onPress={() => handleJoin(status)}
                disabled={joining || disabledFull}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityState={{ selected: active, disabled: disabledFull }}
                style={[
                    st.choice,
                    active && filled
                        ? { backgroundColor: activeColor, borderColor: activeColor }
                        : { backgroundColor: active ? withOpacity(activeColor, 0.15) : C.card, borderColor: active ? activeColor : C.border },
                    disabledFull && st.dimmed,
                ]}
            >
                {joining && active
                    ? <ActivityIndicator size="small" color={filled ? C.onPrimary : activeColor} />
                    : <Text style={[st.choiceText, { color: active ? (filled ? C.onPrimary : activeColor) : status === 'OUT' ? C.error : C.text }]} numberOfLines={1}>
                        {disabledFull ? 'Kadro Dolu' : label}
                    </Text>}
            </TouchableOpacity>
        );
    };

    const benchChip = (p: any, i: number, tag?: string) => (
        <TouchableOpacity
            key={p.userId || i}
            disabled={isGuest(p.userId)}
            onPress={() => router.push(`/user/${p.userId}` as any)}
            style={[st.benchChip, { backgroundColor: C.iconTile }]}
        >
            <Avatar uri={p.photoURL} name={p.name} size={18} />
            <Text style={[st.benchName, { color: C.text }]} numberOfLines={1}>{compactName(p.name)}</Text>
            {!!tag && <Text style={[st.benchTag, { color: C.textTertiary }]}>{tag}</Text>}
        </TouchableOpacity>
    );

    const adminButton = (icon: keyof typeof Ionicons.glyphMap, label: string, onPress: () => void, locked?: boolean) => (
        <TouchableOpacity onPress={onPress} activeOpacity={0.8} style={[st.adminBtn, { backgroundColor: C.card, borderColor: C.border }]}>
            <Ionicons name={icon} size={16} color={C.textSecondary} />
            <Text style={[st.adminBtnText, { color: C.text }]} numberOfLines={1}>{label}</Text>
            {locked && <Ionicons name="lock-closed" size={12} color={C.gold} />}
        </TouchableOpacity>
    );

    const pitchW = screenW - 32;

    /* ─────────────────────────── Render ─────────────────────────── */

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {background}

            <View style={[st.header, { paddingTop: insets.top + 8 }]}>
                {backButton}
                <View style={st.rowCenter}>
                    <Pill label={statusPill.label} color={statusPill.color} />
                    <TouchableOpacity onPress={handleShare} style={[st.roundBtn, { backgroundColor: C.card, borderColor: C.border }]} accessibilityLabel="Maçı paylaş">
                        <Ionicons name="share-social-outline" size={19} color={C.text} />
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 16 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchMatchData(); }} tintColor={C.primaryText} />}
            >
                {/* Hero */}
                <PitchCard style={st.hero}>
                    <PitchPill label={heroTag} />
                    <View style={{ marginTop: 'auto' }}>
                        <Text style={[st.heroTitle, { color: ON_PITCH }]} numberOfLines={1}>{match.venue || 'Maç'}</Text>
                        <Text style={[st.heroMeta, { color: ON_PITCH_MUTED }]} numberOfLines={2}>{heroMeta}</Text>
                        {(match.feePerPerson || 0) > 0 && <Text style={[st.heroFee, { color: ON_PITCH }]}>Kişi Başı: {formatTL(match.feePerPerson)}</Text>}
                    </View>
                </PitchCard>

                {/* Score (finished) */}
                {isFinished && (
                    <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                        <View style={st.scoreRow}>
                            <View style={st.scoreTeam}>
                                <Text style={[st.scoreTeamName, { color: C.teamA }]} numberOfLines={1}>{teamAName}</Text>
                                <Text style={[st.scoreNum, { color: hasScore && match.scoreA > match.scoreB ? C.link : C.text }]}>{hasScore ? match.scoreA : '–'}</Text>
                            </View>
                            <Text style={[st.scoreSep, { color: C.textTertiary }]}>–</Text>
                            <View style={st.scoreTeam}>
                                <Text style={[st.scoreTeamName, { color: C.teamB }]} numberOfLines={1}>{teamBName}</Text>
                                <Text style={[st.scoreNum, { color: hasScore && match.scoreB > match.scoreA ? C.link : C.text }]}>{hasScore ? match.scoreB : '–'}</Text>
                            </View>
                        </View>
                        <View style={st.actionRow}>
                            <PrimaryButton label="İstatistikler" icon="stats-chart-outline" onPress={() => router.push(`/match/${id}/post-match`)} style={{ flex: 1, height: 46 }} />
                            <SecondaryButton label="MVP Oylaması" icon="trophy-outline" onPress={() => router.push(`/match/${id}/mvp-vote`)} style={{ flex: 1, height: 46 }} />
                        </View>
                    </View>
                )}

                {/* Participation */}
                {!isFinished && !isPast && (
                    <View style={st.actionRow}>
                        {choice('IN', match.customizations?.yesText || match.customizations?.joinButtonText || 'Katıl', C.primary, true)}
                        {choice('WAITLIST', match.customizations?.maybeText || 'Yedeklere Geç', C.warning)}
                        {choice('OUT', match.customizations?.noText || 'Çık', C.error)}
                    </View>
                )}

                {!isFinished && isPast && (
                    <PrimaryButton label="Maçı Bitir & İstatistik Gir" icon="stats-chart-outline" onPress={openPostMatch} />
                )}

                {/* Roster */}
                <View>
                    <View style={st.sectionHead}>
                        <Eyebrow>Kadro ({confirmed.length}/{maxPlayers})</Eyebrow>
                        <Segmented<'list' | 'pitch'>
                            options={[{ key: 'list', label: '', icon: 'list' }, { key: 'pitch', label: '', icon: 'football-outline' }]}
                            value={rosterView}
                            onChange={setRosterView}
                            style={st.viewToggle}
                        />
                    </View>
                    {rosterView === 'pitch' ? (
                        <FormationPitch
                            teamA={teamA.map(p => ({ key: p.userId, name: p.name, photoURL: p.photoURL }))}
                            teamB={teamB.map(p => ({ key: p.userId, name: p.name, photoURL: p.photoURL }))}
                            teamAName={teamAName}
                            teamBName={teamBName}
                            width={pitchW}
                            height={pitchW * 1.35}
                        />
                    ) : (
                        <View style={[st.card, st.rosterCard, { backgroundColor: C.card, borderColor: C.border }]}>
                            {rosterColumn(teamA, teamAName, C.teamA)}
                            <View style={[st.rosterDivider, { backgroundColor: C.divider }]} />
                            {rosterColumn(teamB, teamBName, C.teamB)}
                        </View>
                    )}
                </View>

                {/* Bench */}
                {(waitlist.length > 0 || maybe.length > 0) && (
                    <View>
                        <Eyebrow style={{ marginBottom: 8 }}>Yedekler / Bekleyenler ({waitlist.length + maybe.length})</Eyebrow>
                        <View style={st.benchWrap}>
                            {waitlist.map((p, i) => benchChip(p, i, `#${i + 1}`))}
                            {maybe.map((p, i) => benchChip(p, i, 'Belki'))}
                        </View>
                    </View>
                )}

                {/* Join group prompt */}
                {user && match.groupId && group && !(group.members || []).includes(user.uid) && (
                    <View style={[st.card, st.promptCard, { backgroundColor: C.card, borderColor: C.border }]}>
                        <View style={{ flex: 1 }}>
                            <Text style={[st.promptTitle, { color: C.text }]}>Bu grubu sevdin mi?</Text>
                            <Text style={[st.muted, { color: C.textSecondary }]}>Gruba katıl, maçlardan haberdar ol</Text>
                        </View>
                        <PrimaryButton label={group.privacy === 'private' ? 'İstek Gönder' : 'Katıl'} onPress={handleJoinGroup} style={{ height: 40 }} />
                    </View>
                )}

                <AdBanner placement="match" />

                {/* Admin */}
                {isAdmin && (
                    <View>
                        <Eyebrow style={{ marginBottom: 8 }}>Yönetici Aksiyonları</Eyebrow>
                        <View style={st.adminGrid}>
                            {adminButton('person-add-outline', 'Oyuncu Davet Et', openInvite)}
                            {adminButton('person-outline', 'Misafir Ekle', () => setSheet('guest'))}
                        </View>
                        <View style={[st.adminGrid, { marginTop: 8 }]}>
                            {adminButton('people-outline', 'Kadro Kur', () => router.push(`/match/${id}/team-builder`))}
                            {adminButton('wallet-outline', 'Maç Kasası', () => proGate(canManageDebts, 'Kasa ve borç takibi Kaptan Pro üyelere özel.', () => router.push(`/match/${id}/safe`)), !canManageDebts)}
                        </View>
                        <View style={st.adminLinks}>
                            <TouchableOpacity
                                hitSlop={8}
                                onPress={() => proGate(canCustomizeMatch(id), 'Maç özelleştirme Kaptan Pro üyelere veya Jeton kullananlara özel.', () => router.push(`/match/${id}/match-customization` as any))}
                            >
                                <Text style={[st.adminLink, { color: C.textSecondary }]}>Maçı Özelleştir</Text>
                            </TouchableOpacity>
                            {!isFinished && (
                                <TouchableOpacity hitSlop={8} onPress={openPostMatch}>
                                    <Text style={[st.adminLink, { color: C.textSecondary }]}>Skoru Gir</Text>
                                </TouchableOpacity>
                            )}
                            {!isFinished && (
                                <TouchableOpacity hitSlop={8} onPress={handleDeleteMatch}>
                                    <Text style={[st.adminLink, { color: C.error }]}>Maçı İptal Et</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                )}
            </ScrollView>

            {/* Guest */}
            <Sheet visible={sheet === 'guest'} onClose={() => setSheet(null)} title="Misafir Oyuncu Ekle">
                <Text style={[st.sheetIntro, { color: C.textSecondary }]}>Hesabı olmayan oyuncuları kadroya eklemek için kullan.</Text>
                <TextField value={guestName} onChangeText={setGuestName} placeholder="Oyuncu adı" autoFocus maxLength={30} onSubmitEditing={handleAddGuest} />
                <PrimaryButton label="Ekle" onPress={handleAddGuest} disabled={!guestName.trim()} style={{ marginTop: 12 }} />
            </Sheet>

            {/* Invite */}
            <Sheet visible={sheet === 'invite'} onClose={() => setSheet(null)} title="Oyuncu Davet Et">
                <View style={st.searchRow}>
                    <TextField
                        style={{ flex: 1 }}
                        value={inviteQuery}
                        onChangeText={filterMutuals}
                        placeholder="Kullanıcı adı veya e-posta"
                        autoCapitalize="none"
                        returnKeyType="search"
                        onSubmitEditing={handleGlobalSearch}
                    />
                    <TouchableOpacity onPress={handleGlobalSearch} style={[st.searchBtn, { backgroundColor: C.primary }]} accessibilityLabel="Ara">
                        <Ionicons name="search" size={20} color={C.onPrimary} />
                    </TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
                    {loadingMutuals && <ActivityIndicator style={{ padding: 20 }} color={C.primaryText} />}
                    {!loadingMutuals && inviteResults.length === 0 && (
                        <Text style={[st.muted, { color: C.textTertiary, textAlign: 'center', padding: 20 }]}>
                            {inviteQuery ? 'Kimse bulunamadı' : 'Davet edilecek karşılıklı takipleştiğin kimse yok'}
                        </Text>
                    )}
                    {inviteResults.map((u, i) => (
                        <View key={u.uid} style={[st.inviteRow, { borderBottomColor: C.divider }, i === inviteResults.length - 1 && { borderBottomWidth: 0 }]}>
                            <Avatar uri={u.photoURL} name={u.displayName || u.username} size={38} />
                            <View style={{ flex: 1 }}>
                                <Text style={[st.inviteName, { color: C.text }]} numberOfLines={1}>{u.displayName || u.username}</Text>
                                {!!u.username && <Text style={[st.muted, { color: C.textSecondary }]}>@{u.username}</Text>}
                            </View>
                            <TouchableOpacity
                                onPress={() => handleSendInvite(u)}
                                disabled={inviteSending === u.uid}
                                style={[st.smallBtn, { backgroundColor: C.primary }, inviteSending === u.uid && st.dimmed]}
                            >
                                {inviteSending === u.uid
                                    ? <ActivityIndicator size="small" color={C.onPrimary} />
                                    : <Text style={[st.smallBtnText, { color: C.onPrimary }]}>Davet Et</Text>}
                            </TouchableOpacity>
                        </View>
                    ))}
                </ScrollView>
                <SecondaryButton label="Davet Linki Paylaş" icon="link-outline" onPress={() => { setSheet(null); handleShare(); }} style={{ marginTop: 12 }} />
            </Sheet>
        </View>
    );
}

const st = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    dimmed: { opacity: 0.5 },
    muted: { fontSize: 12, fontWeight: '500' },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
    headerTitle: { fontSize: 17, fontWeight: '800' },
    roundBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

    hero: { height: 160 },
    heroTitle: { fontSize: 20, fontWeight: '800' },
    heroMeta: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    heroFee: { fontSize: 14, fontWeight: '800', marginTop: 6 },

    card: { borderRadius: 20, borderWidth: 1, padding: 16 },
    scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 14 },
    scoreTeam: { flex: 1, alignItems: 'center' },
    scoreTeamName: { fontSize: 12, fontWeight: '800', marginBottom: 2 },
    scoreNum: { fontSize: 44, fontWeight: '900' },
    scoreSep: { fontSize: 26, fontWeight: '800' },

    actionRow: { flexDirection: 'row', gap: 8 },
    choice: { flex: 1, height: 48, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
    choiceText: { fontSize: 13.5, fontWeight: '800' },

    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    viewToggle: { width: 104, padding: 3 },
    rosterCard: { flexDirection: 'row', gap: 14 },
    rosterDivider: { width: 1 },
    rosterHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 6 },
    rosterTeam: { flex: 1, fontSize: 12.5, fontWeight: '800' },
    rosterCount: { fontSize: 10.5, fontWeight: '700' },
    rosterItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
    rosterName: { flex: 1, fontSize: 12.5, fontWeight: '700' },
    rosterRating: { fontSize: 11, fontWeight: '800' },

    benchWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    benchChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 5, paddingRight: 10, paddingVertical: 5, borderRadius: 999 },
    benchName: { fontSize: 12, fontWeight: '700', maxWidth: 110 },
    benchTag: { fontSize: 10.5, fontWeight: '700' },

    promptCard: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    promptTitle: { fontSize: 13.5, fontWeight: '800' },

    adminGrid: { flexDirection: 'row', gap: 8 },
    adminBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 12, paddingHorizontal: 8, borderRadius: 12, borderWidth: 1 },
    adminBtnText: { fontSize: 12.5, fontWeight: '700' },
    adminLinks: { flexDirection: 'row', justifyContent: 'space-around', paddingVertical: 12 },
    adminLink: { fontSize: 12, fontWeight: '700' },

    sheetIntro: { fontSize: 13, textAlign: 'center', marginBottom: 12 },
    searchRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
    searchBtn: { width: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    inviteRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    inviteName: { fontSize: 14.5, fontWeight: '700' },
    smallBtn: { paddingHorizontal: 12, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    smallBtnText: { fontSize: 12.5, fontWeight: '700' },
});
