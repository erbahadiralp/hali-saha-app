import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { differenceInHours } from 'date-fns';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { sendEmailVerification } from 'firebase/auth';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import istanbulVenues from '../../assets/istanbul_sahalari.json';
import { AdBanner } from '../../components/AdBanner';
import { useAlert } from '../../components/CustomAlertProvider';
import { calculateMatchRating } from '../../components/FormGraph';
import { Avatar, Eyebrow, PrimaryButton, compactName, toDate } from '../../components/group/GroupUI';
import { ON_PITCH, ON_PITCH_MUTED, PITCH_PILL, PitchCard, PitchPill, matchDayLabel } from '../../components/match/MatchUI';
import NetworkError from '../../components/NetworkError';
import { useSettingsColors } from '../../components/settings/SettingsUI';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { withOpacity } from '../../constants/designTokens';
import { useAuth } from '../../context/AuthContext';
import { useNotification } from '../../context/NotificationContext';
import { usePremium } from '../../context/PremiumContext';
import { auth } from '../../firebaseConfig';
import { getGroupDetails, getMatchParticipants, getUserMatches, getUserProfile } from '../../services/firestore';
import { PlayerStats, playedMatches, resolveOverall, summarizeStats } from '../../services/playerStats';
import { ensureStatsMigrated } from '../../services/statsService';
import { getLevelDetails } from '../../services/userService';

/**
 * Layout: design/home-active-user.png and design/home-empty-state.png; colors from designTokens.
 * The empty state's "Nasıl Çalışır?" section and the "Grup Bul" action are intentionally omitted.
 */

const TAB_BAR_HEIGHT = 68; // keep in sync with app/(tabs)/_layout.tsx
const AVATAR_STACK = 3;

const districtOf = (venue?: string) => {
  if (!venue) return null;
  for (const [district, venues] of Object.entries(istanbulVenues as Record<string, string[]>)) {
    if (venues.includes(venue) || venue.toLocaleLowerCase('tr-TR').includes(district.toLocaleLowerCase('tr-TR'))) return district;
  }
  return null;
};

const PLAN_LABELS: Record<string, string> = { captain: 'Kaptan Pro Oyuncusu', player: 'Oyuncu Pro Üyesi', free: 'Halısaha Oyuncusu' };

interface NextMatch {
  match: any;
  groupName: string | null;
  confirmed: number;
  avatars: { key: string; name?: string; photoURL?: string }[];
}

interface LastMatch {
  match: any;
  teamAName: string;
  teamBName: string;
  highlight: { name: string; photoURL?: string; label: string; rating: number } | null;
}

export default function HomeScreen() {
  const { alert } = useAlert();
  const router = useRouter();
  const { user, refreshUser } = useAuth();
  const { unreadCount } = useNotification();
  const { canSeeOverall, tier } = usePremium();
  const C = useSettingsColors();
  const insets = useSafeAreaInsets();

  const [profile, setProfile] = useState<any>(null);
  const [next, setNext] = useState<NextMatch | null>(null);
  const [last, setLast] = useState<LastMatch | null>(null);
  const [stats, setStats] = useState<PlayerStats>(() => summarizeStats(null));
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [bannerDismissed, setBannerDismissed] = useState(true);
  const [sendingVerification, setSendingVerification] = useState(false);

  const fetchData = async (fresh = false) => {
    if (!user) return;
    try {
      setError(null);
      // Same data source as the profile screen, so stats and OVR match exactly.
      let [profileData, dismissed, userMatches] = await Promise.all([
        getUserProfile(user.uid, { fresh }),
        AsyncStorage.getItem('email_banner_dismissed'),
        getUserMatches(user.uid),
      ]);
      // One-time rebuild of legacy (possibly double-counted) profile counters.
      if (await ensureStatsMigrated(profileData)) {
        profileData = await getUserProfile(user.uid, { fresh: true });
      }
      setProfile(profileData);
      setBannerDismissed(dismissed === 'true');
      const loadedAt = Date.now();
      setNow(loadedAt);

      const matches = userMatches.map((m: any) => ({ ...m, date: toDate(m.date) }));
      setStats(summarizeStats(profileData, playedMatches(matches, loadedAt)));

      // Next match: the soonest upcoming one the user has not left.
      const upcoming = matches
        .filter(m => m.status === 'UPCOMING' && m.date.getTime() > loadedAt && m.playerStats?.status !== 'OUT')
        .sort((a, b) => a.date.getTime() - b.date.getTime())[0];
      if (upcoming) {
        const [participants, group] = await Promise.all([
          getMatchParticipants(upcoming.id).catch(() => [] as any[]),
          upcoming.groupId ? getGroupDetails(upcoming.groupId).catch(() => null) : Promise.resolve(null),
        ]);
        const confirmed = (participants as any[]).filter(p => p.status === 'IN');
        const shown = confirmed.slice(0, AVATAR_STACK);
        const photos = await Promise.all(shown.map(p => (p.userId?.startsWith('guest_') ? null : getUserProfile(p.userId).catch(() => null))));
        setNext({
          match: upcoming,
          groupName: (group as any)?.name ?? null,
          confirmed: confirmed.length,
          avatars: shown.map((p, i) => ({ key: p.userId, name: p.name, photoURL: (photos[i] as any)?.photoURL })),
        });
      } else {
        setNext(null);
      }

      // Last finished match with a score.
      const finished = matches
        .filter(m => m.status === 'FINISHED' && m.scoreA !== undefined && m.scoreB !== undefined)
        .sort((a, b) => b.date.getTime() - a.date.getTime())[0];
      if (finished) {
        const participants: any[] = await getMatchParticipants(finished.id).catch(() => []);
        const mvp = finished.motm ? participants.find(p => p.userId === finished.motm) : null;
        const me = participants.find(p => p.userId === user.uid);
        const subject = mvp ?? (me?.status === 'IN' ? me : null);
        let highlight: LastMatch['highlight'] = null;
        if (subject) {
          const won = (subject.team === 'A' && finished.scoreA > finished.scoreB) || (subject.team === 'B' && finished.scoreB > finished.scoreA);
          const subjectProfile: any = subject.userId?.startsWith('guest_') ? null : await getUserProfile(subject.userId).catch(() => null);
          highlight = {
            name: subjectProfile?.displayName || subject.name || 'Oyuncu',
            photoURL: subjectProfile?.photoURL,
            label: mvp ? "Maçın MVP'si" : 'Senin performansın',
            rating: calculateMatchRating({
              goals: subject.goals || 0,
              assists: subject.assists || 0,
              won,
              draw: finished.scoreA === finished.scoreB,
              cleanSheet: subject.cleanSheet || false,
              isMotm: !!mvp,
            }),
          };
        }
        setLast({
          match: finished,
          teamAName: finished.customizations?.teamAName || 'Takım A',
          teamBName: finished.customizations?.teamBName || 'Takım B',
          highlight,
        });
      } else {
        setLast(null);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Veriler yüklenirken hata oluştu');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      if (!user) return;
      refreshUser();
      fetchData();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.uid])
  );

  const handleSendVerification = async () => {
    if (!auth.currentUser) return;
    setSendingVerification(true);
    try {
      await sendEmailVerification(auth.currentUser);
      alert('E-posta Gönderildi', 'Doğrulama e-postası gönderildi. Gelen kutunu (ve spam klasörünü) kontrol et.', [], { type: 'success' });
    } catch (e: any) {
      alert('Hata', e.code === 'auth/too-many-requests' ? 'Çok fazla istek gönderildi. Biraz bekleyip tekrar dene.' : 'E-posta gönderilemedi.', [], { type: 'error' });
    } finally {
      setSendingVerification(false);
    }
  };

  const dismissBanner = async () => {
    setBannerDismissed(true);
    await AsyncStorage.setItem('email_banner_dismissed', 'true');
  };

  /* ─────────────────────────── Derived ─────────────────────────── */

  const firstName = (profile?.displayName || user?.displayName || 'Oyuncu').split(' ')[0];
  const isNewPlayer = stats.matchesPlayed === 0;
  const { level, rank } = getLevelDetails(profile?.stats?.xp || 0);
  const overall = isNewPlayer ? null : resolveOverall(profile, stats);
  const showBanner = !!user && !user.emailVerified && !bannerDismissed;
  const tabBarTop = (insets.bottom > 0 ? insets.bottom + 6 : 14) + TAB_BAR_HEIGHT;

  /* ─────────────────────────── Sections ─────────────────────────── */

  const header = (
    <View style={[st.header, { paddingTop: insets.top + 12 }]}>
      <TouchableOpacity style={st.headerUser} activeOpacity={0.8} onPress={() => router.push('/(tabs)/profile')}>
        <View style={[st.headerAvatar, { borderColor: C.border }]}>
          {profile?.photoURL
            ? <Avatar uri={profile.photoURL} size={52} />
            : <View style={[st.avatarEmpty, { backgroundColor: C.avatar }]}><Ionicons name="person-outline" size={24} color={C.textSecondary} /></View>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[st.hello, { color: C.text }]} numberOfLines={1}>Merhaba, {firstName}</Text>
          <Text style={[st.helloSub, { color: C.textSecondary }]} numberOfLines={1}>
            {isNewPlayer ? 'Aramıza hoş geldin!' : PLAN_LABELS[tier] ?? PLAN_LABELS.free}
          </Text>
        </View>
      </TouchableOpacity>
      <TouchableOpacity
        onPress={() => router.push('/notifications')}
        style={[st.bell, { backgroundColor: C.card, borderColor: C.border }]}
        accessibilityLabel={unreadCount > 0 ? `Bildirimler, ${unreadCount} okunmamış` : 'Bildirimler'}
      >
        <Ionicons name="notifications-outline" size={21} color={C.text} />
        {unreadCount > 0 && <View style={[st.bellDot, { backgroundColor: C.error, borderColor: C.sheet }]} />}
      </TouchableOpacity>
    </View>
  );

  const levelRow = (
    <View style={st.levelRow}>
      <View style={{ flex: 1 }}>
        <Text style={[st.levelEyebrow, { color: C.textSecondary }]}>Oyuncu Seviyesi</Text>
        <View style={st.levelTitleRow}>
          <Text style={[st.levelTitle, { color: C.text }]} numberOfLines={1}>{isNewPlayer ? 'Amatör Lig' : rank}</Text>
          <View style={[st.levelBadge, { borderColor: C.border, backgroundColor: C.iconTile }]}>
            <Text style={[st.levelBadgeText, { color: C.textSecondary }]}>{isNewPlayer ? 'BAŞLANGIÇ' : `SEVİYE ${level}`}</Text>
          </View>
        </View>
      </View>
      {overall !== null && canSeeOverall ? (
        <TouchableOpacity style={st.ovr} onPress={() => router.push('/(tabs)/profile')} activeOpacity={0.7}>
          <Text style={[st.ovrNum, { color: C.text }]}>{overall}</Text>
          <Text style={[st.ovrLabel, { color: C.textSecondary }]}>OVR</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          disabled={isNewPlayer}
          onPress={() => router.push('/settings/premium')}
          style={[st.ovrCircle, { backgroundColor: C.card, borderColor: C.border, shadowColor: C.shadow }]}
          accessibilityLabel="Overall puanı"
        >
          {isNewPlayer
            ? <Text style={[st.ovrDash, { color: C.textSecondary }]}>--</Text>
            : <Ionicons name="lock-closed" size={16} color={C.gold} />}
          <Text style={[st.ovrLabel, { color: C.textSecondary }]}>OVR</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  const nextMatchCard = next && (() => {
    const { match } = next;
    const max = match.maxPlayers || 14;
    const full = next.confirmed >= max;
    const hours = differenceInHours(match.date, now);
    const countdown = hours < 1 ? 'Başlamak üzere' : hours < 24 ? `Son ${hours} Saat` : `${Math.floor(hours / 24)} Gün Kaldı`;
    const place = [districtOf(match.venue), next.groupName].filter(Boolean).join(' · ');
    const extra = next.confirmed - next.avatars.length;
    return (
      <View style={st.section}>
        <View style={st.sectionHead}>
          <Eyebrow style={st.sectionTitle}>Sıradaki Maçın</Eyebrow>
          <TouchableOpacity hitSlop={8} onPress={() => router.push(`/match/${match.id}`)}>
            <Text style={[st.link, { color: C.textSecondary }]}>Detaylar</Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity activeOpacity={0.85} onPress={() => router.push(`/match/${match.id}`)}>
          <PitchCard style={st.nextCard}>
            <View style={st.pillRow}>
              <PitchPill label={full ? `${next.confirmed}/${max} KADRO TAM` : `${next.confirmed}/${max} OYUNCU`} />
              <PitchPill label={matchDayLabel(match.date, new Date(now))} />
            </View>
            <Text style={[st.nextVenue, { color: ON_PITCH }]} numberOfLines={1}>{match.venue || 'Maç'}</Text>
            {!!place && <Text style={[st.nextPlace, { color: ON_PITCH_MUTED }]} numberOfLines={1}>{place}</Text>}
            <View style={[st.nextFoot, { borderTopColor: withOpacity(ON_PITCH, 0.18) }]}>
              <View style={st.stack}>
                {next.avatars.map((a, i) => (
                  <View key={a.key || i} style={i > 0 && st.stacked}>
                    <Avatar uri={a.photoURL} name={a.name} size={30} ring={PITCH_PILL} />
                  </View>
                ))}
                {extra > 0 && (
                  <View style={[st.stacked, st.more]}>
                    <Text style={[st.moreText, { color: ON_PITCH }]}>+{extra}</Text>
                  </View>
                )}
                {next.confirmed === 0 && <Text style={[st.nextPlace, { color: ON_PITCH_MUTED, marginTop: 0 }]}>Henüz katılan yok</Text>}
              </View>
              <View style={st.countdown}>
                <Ionicons name="time-outline" size={16} color={ON_PITCH} />
                <Text style={[st.countdownText, { color: ON_PITCH }]}>{countdown}</Text>
              </View>
            </View>
          </PitchCard>
        </TouchableOpacity>

        <TouchableOpacity activeOpacity={0.8} onPress={() => router.push('/create-match')} style={st.quickAction}>
          <View style={[st.quickIcon, { backgroundColor: C.primary }]}>
            <Ionicons name="add" size={22} color={C.onPrimary} />
          </View>
          <Text style={[st.quickText, { color: C.text }]}>Maç Oluştur</Text>
        </TouchableOpacity>
      </View>
    );
  })();

  const emptyState = !next && (
    <View style={st.empty}>
      <Ionicons name="calendar-outline" size={30} color={C.textSecondary} />
      <Text style={[st.emptyTitle, { color: C.text }]}>Henüz Bir Maçın Yok!</Text>
      <Text style={[st.emptyText, { color: C.textSecondary }]}>
        Hemen ilk maçını planla ya da gruplarındaki maçlara katılarak sahaya adım at.
      </Text>
      <PrimaryButton label="Maç Oluştur" icon="add" onPress={() => router.push('/create-match')} style={st.emptyCta} />
      <TouchableOpacity onPress={() => router.push('/(tabs)/groups')} hitSlop={10} style={st.joinGroup}>
        <Ionicons name="people-outline" size={18} color={C.link} />
        <Text style={[st.joinGroupText, { color: C.text }]}>Gruba Katıl</Text>
      </TouchableOpacity>
    </View>
  );

  const lastMatchSummary = last && (
    <View style={st.section}>
      <Eyebrow style={[st.sectionTitle, { marginBottom: 12 }]}>Son Maç Özeti</Eyebrow>
      <TouchableOpacity activeOpacity={0.8} onPress={() => router.push(`/match/${last.match.id}`)}>
        <View style={st.scoreRow}>
          <Text style={[st.team, { color: C.text }]} numberOfLines={1}>{last.teamAName}</Text>
          <Text style={[st.score, { color: C.text }]}>{last.match.scoreA} - {last.match.scoreB}</Text>
          <Text style={[st.team, { color: C.text, textAlign: 'right' }]} numberOfLines={1}>{last.teamBName}</Text>
        </View>
        {last.highlight && (
          <View style={[st.mvpRow, { borderTopColor: C.divider }]}>
            <Avatar uri={last.highlight.photoURL} name={last.highlight.name} size={38} />
            <View style={{ flex: 1 }}>
              <Text style={[st.mvpName, { color: C.text }]} numberOfLines={1}>{compactName(last.highlight.name)}</Text>
              <Text style={[st.mvpSub, { color: C.textSecondary }]}>{last.highlight.label}</Text>
            </View>
            <Text style={[st.rating, { color: C.textSecondary }]}>{last.highlight.rating.toFixed(1)} REYTİNG</Text>
          </View>
        )}
      </TouchableOpacity>
    </View>
  );

  /* ─────────────────────────── Render ─────────────────────────── */

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <LinearGradient colors={[C.gradient[0], C.gradient[1]]} style={StyleSheet.absoluteFill} />

      {error ? (
        <>
          {header}
          <NetworkError message={error} onRetry={() => { setLoading(true); fetchData(); }} isDark={C.isDark} />
        </>
      ) : (
        <ScrollView
          contentContainerStyle={{ paddingBottom: tabBarTop + 24 }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); refreshUser(); fetchData(true); }} tintColor={C.primaryText} />}
        >
          {header}

          <View style={st.body}>
            {showBanner && (
              <View style={[st.banner, { backgroundColor: withOpacity(C.warning, 0.12), borderColor: withOpacity(C.warning, 0.4) }]}>
                <Ionicons name="mail-unread-outline" size={20} color={C.warning} />
                <Text style={[st.bannerText, { color: C.text }]}>E-posta adresini doğrula</Text>
                <TouchableOpacity onPress={handleSendVerification} disabled={sendingVerification} style={[st.bannerBtn, { backgroundColor: C.warning }]}>
                  {sendingVerification
                    ? <ActivityIndicator size="small" color={C.onPrimary} />
                    : <Text style={[st.bannerBtnText, { color: C.onPrimary }]}>Doğrula</Text>}
                </TouchableOpacity>
                <TouchableOpacity onPress={dismissBanner} hitSlop={8} accessibilityLabel="Uyarıyı kapat">
                  <Ionicons name="close" size={18} color={C.textSecondary} />
                </TouchableOpacity>
              </View>
            )}

            {loading ? (
              <View style={{ gap: 16 }}>
                <SkeletonLoader height={56} borderRadius={16} />
                <SkeletonLoader height={190} borderRadius={20} />
                <SkeletonLoader height={120} borderRadius={20} />
              </View>
            ) : (
              <>
                {levelRow}
                {nextMatchCard}
                {emptyState}
                <AdBanner placement="home" />
                {lastMatchSummary}
              </>
            )}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const st = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 12 },
  headerUser: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  headerAvatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  avatarEmpty: { width: 52, height: 52, borderRadius: 26, alignItems: 'center', justifyContent: 'center' },
  hello: { fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  helloSub: { fontSize: 12.5, fontWeight: '600', marginTop: 2 },
  bell: { width: 46, height: 46, borderRadius: 23, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  bellDot: { position: 'absolute', top: 10, right: 11, width: 10, height: 10, borderRadius: 5, borderWidth: 2 },

  body: { paddingHorizontal: 16, gap: 8 },

  banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, borderWidth: 1, marginBottom: 8 },
  bannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
  bannerBtn: { height: 32, minWidth: 76, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bannerBtnText: { fontSize: 12.5, fontWeight: '700' },

  levelRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
  levelEyebrow: { fontSize: 12, fontWeight: '600' },
  levelTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 4 },
  levelTitle: { fontSize: 22, fontWeight: '800', letterSpacing: -0.4, flexShrink: 1 },
  levelBadge: { borderWidth: 1, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
  levelBadgeText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.4 },
  ovr: { alignItems: 'center', minWidth: 52 },
  ovrNum: { fontSize: 24, fontWeight: '900' },
  ovrLabel: { fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  ovrCircle: { width: 58, height: 58, borderRadius: 29, borderWidth: 1, alignItems: 'center', justifyContent: 'center', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.25, shadowRadius: 12, elevation: 6 },
  ovrDash: { fontSize: 18, fontWeight: '900', lineHeight: 20 },

  section: { marginTop: 8 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  sectionTitle: { fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
  link: { fontSize: 13, fontWeight: '700' },

  nextCard: { minHeight: 186, borderRadius: 22 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  nextVenue: { fontSize: 22, fontWeight: '800', marginTop: 14 },
  nextPlace: { fontSize: 13, fontWeight: '600', marginTop: 3 },
  nextFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, marginTop: 16, paddingTop: 12 },
  stack: { flexDirection: 'row', alignItems: 'center' },
  stacked: { marginLeft: -8 },
  more: { minWidth: 30, height: 30, borderRadius: 15, paddingHorizontal: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: PITCH_PILL },
  moreText: { fontSize: 11, fontWeight: '800' },
  countdown: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  countdownText: { fontSize: 13.5, fontWeight: '800' },

  quickAction: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 18, alignSelf: 'flex-start' },
  quickIcon: { width: 38, height: 38, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  quickText: { fontSize: 15, fontWeight: '800' },

  empty: { alignItems: 'center', paddingTop: 36, paddingBottom: 24, gap: 10 },
  emptyTitle: { fontSize: 19, fontWeight: '800', marginTop: 12 },
  emptyText: { fontSize: 13.5, lineHeight: 20, textAlign: 'center', maxWidth: 290 },
  emptyCta: { alignSelf: 'stretch', height: 52, marginTop: 14 },
  joinGroup: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10 },
  joinGroupText: { fontSize: 14.5, fontWeight: '800' },

  scoreRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10 },
  team: { flex: 1, fontSize: 15, fontWeight: '800' },
  score: { fontSize: 22, fontWeight: '900', marginHorizontal: 12 },
  mvpRow: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopWidth: 1, marginTop: 10, paddingTop: 14 },
  mvpName: { fontSize: 14.5, fontWeight: '800' },
  mvpSub: { fontSize: 11.5, marginTop: 1 },
  rating: { fontSize: 12, fontWeight: '800', letterSpacing: 0.3 },
});
