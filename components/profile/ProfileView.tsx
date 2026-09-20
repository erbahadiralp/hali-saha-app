import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { sendEmailVerification } from 'firebase/auth';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { ReactNode, useCallback, useRef, useState } from 'react';
import { Image } from 'expo-image';
import {
    ActivityIndicator,
    Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Defs, Path, Polyline, Stop, LinearGradient as SvgLinearGradient } from 'react-native-svg';
import { THEMES } from '../../constants/cardThemes';
import { palette, withOpacity } from '../../constants/designTokens';
import { useAuth } from '../../context/AuthContext';
import { usePremium } from '../../context/PremiumContext';
import { auth, db } from '../../firebaseConfig';
import {
    checkIfFollowing,
    followUser,
    getFollowers,
    getFollowing,
    getMatchDetails,
    getUserGroups,
    getUserMatches,
    getUserProfile,
    unfollowUser,
} from '../../services/firestore';
import { getGroupPlayerRating } from '../../services/groupService';
import { playedMatches, resolveOverall, summarizeStats } from '../../services/playerStats';
import { blockUser, hasAlreadyReported, REPORT_REASONS, ReportReason, reportUser } from '../../services/reportService';
import { getLevelDetails } from '../../services/userService';
import { getVacationStatus } from '../../services/vacationService';
import { AdBanner } from '../AdBanner';
import { useAlert } from '../CustomAlertProvider';
import { calculateMatchRating } from '../FormGraph';
import NetworkError from '../NetworkError';
import { SettingsColors, useSettingsColors } from '../settings/SettingsUI';
import { ProfileCardSkeleton, SkeletonLoader, StatsRowSkeleton } from '../SkeletonLoader';
import { StatsShareCard } from '../StatsShareCard';

/**
 * Single profile screen for both the signed-in user and other players.
 * Layout: design/tasarım (Profilim + Başka Kullanıcı Profili); follower counts live inside the player card.
 */

interface ProfileViewProps {
    /** Profile to show; defaults to the signed-in user. */
    userId?: string;
    /** Group context for "grup gücü" rating on the player card. */
    groupId?: string;
    /** Rendered as a tab root (no back button, extra bottom space for the tab bar). */
    isTabRoot?: boolean;
}

interface DebtItem {
    matchId: string;
    venue: string;
    date: Date;
    amount: number;
}

const DAY_MS = 1000 * 60 * 60 * 24;
const toDate = (value: any): Date => {
    if (value && typeof value.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    return value ? new Date(value) : new Date();
};

const POSITION_CODES: Record<string, string> = { GK: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'FWD', Kaleci: 'GK', Defans: 'DEF', 'Orta Saha': 'MID', Forvet: 'FWD' };
const FOOT_LABELS: Record<string, string> = { left: 'Sol Ayak', right: 'Sağ Ayak', both: 'Çift Ayak' };

const titleCase = (name?: string) =>
    name ? name.split(' ').map(w => w.charAt(0).toLocaleUpperCase('tr-TR') + w.slice(1).toLocaleLowerCase('tr-TR')).join(' ') : 'Oyuncu';

const initials = (name?: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    return (parts.length >= 2 ? parts[0][0] + parts[1][0] : name.substring(0, 2)).toLocaleUpperCase('tr-TR');
};

type MatchResult = 'win' | 'draw' | 'loss' | null;

function matchOutcome(m: any): { result: MatchResult; rating: number } {
    const ps = m.playerStats || {};
    const hasScore = m.scoreA !== undefined && m.scoreB !== undefined;
    const isDraw = hasScore && m.scoreA === m.scoreB;
    const won = !!(ps.won || (hasScore && ((ps.team === 'A' && m.scoreA > m.scoreB) || (ps.team === 'B' && m.scoreB > m.scoreA))));
    const conceded = ps.team === 'A' ? m.scoreB : (ps.team === 'B' ? m.scoreA : undefined);
    const rating = calculateMatchRating({
        goals: ps.goals || 0,
        assists: ps.assists || 0,
        won,
        draw: isDraw,
        cleanSheet: ps.cleanSheet || false,
        conceded,
        saves: ps.saves,
        isMotm: ps.isMotm || false,
    });
    return { result: hasScore ? (won ? 'win' : isDraw ? 'draw' : 'loss') : null, rating };
}

export default function ProfileView({ userId, groupId, isTabRoot }: ProfileViewProps) {
    const { alert } = useAlert();
    const router = useRouter();
    const insets = useSafeAreaInsets();
    const C = useSettingsColors();
    const { user, refreshUser } = useAuth();
    const { canSeeFormGraph, canSeeFullStats, canSeeOverall } = usePremium();

    const targetId = userId || user?.uid;
    const isOwn = !!user && targetId === user.uid;
    // Other players' form & stats are a Pro feature; your own form graph has its own gate.
    const canSeeForm = isOwn ? canSeeFormGraph : canSeeFullStats;
    const canSeeStats = isOwn || canSeeFullStats;

    const [profile, setProfile] = useState<any>(null);
    const [matches, setMatches] = useState<any[]>([]);
    const [groups, setGroups] = useState<any[]>([]);
    const [debts, setDebts] = useState<DebtItem[]>([]);
    const [groupRating, setGroupRating] = useState<number | null>(null);
    const [vacation, setVacation] = useState<{ type?: string; daysRemaining: number } | null>(null);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const loadedIdRef = useRef<string | null>(null);

    const [isFollowing, setIsFollowing] = useState(false);
    const [followLoading, setFollowLoading] = useState(false);
    const [followersCount, setFollowersCount] = useState(0);
    const [followingCount, setFollowingCount] = useState(0);
    const [followModal, setFollowModal] = useState<'followers' | 'following' | null>(null);
    const [followList, setFollowList] = useState<any[]>([]);
    const [listLoading, setListLoading] = useState(false);

    const [infoModal, setInfoModal] = useState<'xp' | 'form' | 'overall' | null>(null);
    const [showShareCard, setShowShareCard] = useState(false);
    const [showActionMenu, setShowActionMenu] = useState(false);
    const [showReportModal, setShowReportModal] = useState(false);
    const [sendingVerification, setSendingVerification] = useState(false);
    const [emailBannerDismissed, setEmailBannerDismissed] = useState(false);

    const fetchDebts = async (uid: string) => {
        try {
            const snap = await getDocs(query(collection(db, 'match_participants'), where('userId', '==', uid), where('status', '==', 'IN')));
            const unpaid = snap.docs.map(d => d.data() as any).filter(p => !p.paid);
            const details = await Promise.all(unpaid.map(p => getMatchDetails(p.matchId)));
            const items: DebtItem[] = [];
            details.forEach((match: any, i) => {
                if (match?.feePerPerson > 0) {
                    items.push({ matchId: unpaid[i].matchId, venue: match.venue || 'Bilinmiyor', date: toDate(match.date), amount: match.feePerPerson });
                }
            });
            setDebts(items.sort((a, b) => b.date.getTime() - a.date.getTime()));
        } catch (e) {
            console.error('Failed to fetch debts:', e);
        }
    };

    const fetchData = async (isRefresh = false) => {
        if (!targetId) return;
        try {
            setError(null);
            if (!isRefresh && loadedIdRef.current !== targetId) setLoading(true);

            const [profileData, matchesData] = await Promise.all([
                getUserProfile(targetId, { fresh: isRefresh }),
                getUserMatches(targetId),
            ]);
            const p: any = profileData;
            setProfile(p);
            setFollowersCount(p?.followersCount || 0);
            setFollowingCount(p?.followingCount || 0);
            loadedIdRef.current = targetId;

            setMatches(playedMatches(matchesData));

            if (isOwn) {
                const [groupsData] = await Promise.all([
                    getUserGroups(targetId),
                    fetchDebts(targetId),
                ]);
                setGroups(groupsData);

                try {
                    const v = await getVacationStatus(targetId);
                    if (v.isOnVacation && v.currentVacation) {
                        const daysRemaining = Math.max(0, Math.ceil((toDate(v.currentVacation.endsAt).getTime() - Date.now()) / DAY_MS));
                        setVacation({ type: v.currentVacation.type, daysRemaining });
                    } else {
                        setVacation(null);
                    }
                } catch { /* vacation badge is optional */ }
            } else if (user) {
                setIsFollowing(await checkIfFollowing(user.uid, targetId));
            }

            if (groupId) {
                try {
                    const g = await getGroupPlayerRating(groupId, targetId);
                    setGroupRating(g ? g.rating : null);
                } catch (e) {
                    console.error('Error fetching group rating:', e);
                }
            } else {
                setGroupRating(null);
            }
        } catch (e: any) {
            console.error(e);
            setError(e.message || 'Profil yüklenirken bir hata oluştu');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            if (isOwn) refreshUser();
            fetchData();
        }, [targetId, user?.uid, groupId])
    );

    const handleFollowToggle = async () => {
        if (!user || !targetId) return;
        setFollowLoading(true);
        try {
            if (isFollowing) {
                await unfollowUser(user.uid, targetId);
                setIsFollowing(false);
                setFollowersCount(c => Math.max(0, c - 1));
            } else {
                await followUser(user.uid, targetId, user.displayName || 'İsimsiz Oyuncu');
                setIsFollowing(true);
                setFollowersCount(c => c + 1);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setFollowLoading(false);
        }
    };

    const openFollowList = async (type: 'followers' | 'following') => {
        if (!targetId) return;
        setFollowModal(type);
        setListLoading(true);
        try {
            setFollowList(type === 'followers' ? await getFollowers(targetId) : await getFollowing(targetId));
        } catch (e) {
            console.error(e);
        } finally {
            setListLoading(false);
        }
    };

    const handleSendVerificationEmail = async () => {
        if (!auth.currentUser) return;
        setSendingVerification(true);
        try {
            await sendEmailVerification(auth.currentUser);
            alert('E-posta Gönderildi ✉️', 'Doğrulama e-postası gönderildi. Lütfen gelen kutunu kontrol et.', [], { type: 'success' });
        } catch (e: any) {
            alert('Hata', e.code === 'auth/too-many-requests' ? 'Çok fazla istek. Bir süre bekle.' : 'E-posta gönderilemedi.', [], { type: 'error' });
        } finally {
            setSendingVerification(false);
        }
    };

    const confirmBlock = () => {
        setShowActionMenu(false);
        alert(
            'Kullanıcıyı Engelle',
            `${profile?.displayName || 'Bu kullanıcıyı'} engellemek istediğine emin misin? Engellenen kullanıcı seninle etkileşime geçemez.`,
            [
                { text: 'Vazgeç', style: 'cancel' },
                {
                    text: 'Engelle',
                    style: 'destructive',
                    onPress: async () => {
                        if (!user || !targetId) return;
                        try {
                            await blockUser(user.uid, targetId);
                            alert('Engellendi', 'Kullanıcı engellendi.', [], { type: 'success' });
                            router.back();
                        } catch {
                            alert('Hata', 'Engelleme işlemi başarısız.', [], { type: 'error' });
                        }
                    },
                },
            ],
            { type: 'warning' }
        );
    };

    const submitReport = async (reason: ReportReason) => {
        if (!user || !targetId) return;
        setShowReportModal(false);
        try {
            if (await hasAlreadyReported(user.uid, targetId)) {
                alert('Bilgi', 'Bu kullanıcıyı zaten şikayet etmişsin.', [], { type: 'info' });
                return;
            }
            await reportUser(user.uid, targetId, reason);
            alert('Şikayet Alındı', 'Şikayetin incelenmek üzere alındı. Teşekkürler.', [], { type: 'success' });
        } catch {
            alert('Hata', 'Şikayet gönderilemedi.', [], { type: 'error' });
        }
    };

    const goPremium = () => router.push('/settings/premium');

    /* ─────────────────────────── Header ─────────────────────────── */
    const header = (
        <View style={[st.header, { paddingTop: insets.top + 8 }]}>
            {!isTabRoot && (
                <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityLabel="Geri">
                    <Ionicons name="chevron-back" size={24} color={C.text} />
                </TouchableOpacity>
            )}
            <Text style={[isTabRoot ? st.titleLarge : st.title, { color: C.text }]} numberOfLines={1}>
                {isOwn ? 'Profilim' : (profile?.username ? `@${profile.username}` : 'Profil')}
            </Text>
            {isOwn ? (
                <TouchableOpacity
                    onPress={() => router.push('/settings')}
                    style={[st.roundBtn, { backgroundColor: C.card, borderColor: C.border }]}
                    accessibilityLabel="Ayarlar"
                >
                    <Ionicons name="settings-outline" size={20} color={C.text} />
                </TouchableOpacity>
            ) : user ? (
                <TouchableOpacity
                    onPress={() => setShowActionMenu(true)}
                    style={[st.roundBtn, { backgroundColor: C.card, borderColor: C.border }]}
                    accessibilityLabel="Diğer seçenekler"
                >
                    <Ionicons name="ellipsis-horizontal" size={20} color={C.text} />
                </TouchableOpacity>
            ) : null}
        </View>
    );

    const background = <LinearGradient colors={[C.gradient[0], C.gradient[1]]} style={StyleSheet.absoluteFill} />;

    if (error) {
        return <NetworkError message={error} onRetry={() => fetchData()} isDark={C.isDark} />;
    }

    if (loading || !targetId) {
        return (
            <View style={{ flex: 1, backgroundColor: C.background }}>
                {background}
                {header}
                <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 4 }}>
                    <ProfileCardSkeleton />
                    <StatsRowSkeleton />
                    <View style={{ height: 16 }} />
                    <SkeletonLoader height={140} borderRadius={20} />
                </ScrollView>
            </View>
        );
    }

    if (!profile) {
        return (
            <View style={{ flex: 1, backgroundColor: C.background }}>
                {background}
                {header}
                <View style={st.center}>
                    <Text style={{ color: C.textSecondary }}>Profil bulunamadı</Text>
                </View>
            </View>
        );
    }

    /* ─────────────────────────── Derived data ─────────────────────────── */
    const outcomes = matches.map(matchOutcome);
    // Shared with Ana Sayfa so both screens always show the same numbers and OVR.
    const stats = summarizeStats(profile, matches);
    const overall = resolveOverall(profile, stats);
    const displayOverall = groupRating ?? overall;
    const winRate = stats.matchesPlayed > 0 ? Math.min(100, Math.round((stats.wins / stats.matchesPlayed) * 100)) : 0;
    const totalDebt = debts.reduce((sum, d) => sum + d.amount, 0);
    const isEmailVerified = user?.emailVerified ?? false;

    const recentRatings = outcomes.slice(0, 10).map(o => o.rating);
    const avgRating = recentRatings.length ? recentRatings.reduce((a, b) => a + b, 0) / recentRatings.length : 0;
    let trend = 0;
    if (recentRatings.length >= 2) {
        const prev = recentRatings.slice(1, 4);
        trend = recentRatings[0] - prev.reduce((a, b) => a + b, 0) / prev.length;
    }
    const trendInfo = trend > 0.1
        ? { icon: 'trending-up' as const, color: C.link, text: 'Yükselişte' }
        : trend < -0.1
            ? { icon: 'trending-down' as const, color: C.error, text: 'Düşüşte' }
            : { icon: 'remove' as const, color: C.warning, text: 'Stabil' };

    /* ─────────────────────────── Player card ─────────────────────────── */
    const skin = profile.cardTheme && profile.cardTheme !== 'varsayilan' ? THEMES[profile.cardTheme] : null;
    const cardColors = (skin?.colors ?? (C.isDark ? [palette.darkGreen, palette.darkEnd] : [palette.green, palette.darkGreen])) as [string, string, ...string[]];
    const onCard = palette.white;
    const onCardMuted = withOpacity(palette.white, 0.7);
    const cardAccent = skin?.levelColor ?? (C.isDark ? palette.greenBright : palette.white);
    const { level, currentLevelXp, nextLevelXp, rank, progress } = getLevelDetails(profile.stats?.xp || 0);
    const positionCode = POSITION_CODES[profile.position] || null;
    const tagline = [
        FOOT_LABELS[profile.preferredFoot],
        profile.nickname ? `"${profile.nickname}"` : null,
        isOwn && profile.username ? `@${profile.username}` : null,
    ].filter(Boolean).join(' · ');

    const onOverallPress = () => {
        if (!canSeeOverall) goPremium();
        else if (isOwn) setInfoModal('overall');
    };

    const playerCard = (
        <LinearGradient
            colors={cardColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[st.playerCard, { borderColor: skin?.border ?? (C.isDark ? withOpacity(palette.greenBright, 0.18) : palette.transparent) }]}
        >
            <LinearGradient
                colors={[withOpacity(palette.greenBright, 0.22), palette.transparent]}
                start={{ x: 1, y: 0 }}
                end={{ x: 0.3, y: 0.6 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />

            <View style={st.cardTop}>
                <TouchableOpacity onPress={onOverallPress} activeOpacity={0.7} accessibilityLabel="Overall puanı">
                    <View style={st.row}>
                        {!canSeeOverall && <Ionicons name="lock-closed" size={16} color={palette.warning} style={{ marginRight: 4 }} />}
                        <Text style={[st.ovr, { color: onCard }]}>{canSeeOverall ? Math.round(displayOverall) : '—'}</Text>
                    </View>
                    <Text style={[st.ovrLabel, { color: palette.warning }]}>{groupRating !== null ? 'GRUP GÜCÜ' : 'OVR'}</Text>
                </TouchableOpacity>
                <View style={st.cardTopRight}>
                    {positionCode && (
                        <View style={[st.posPill, { backgroundColor: withOpacity(palette.white, 0.14) }]}>
                            <Text style={[st.posText, { color: onCard }]}>{positionCode}</Text>
                        </View>
                    )}
                    {isOwn && (
                        <TouchableOpacity
                            onPress={() => setShowShareCard(true)}
                            style={[st.cardIconBtn, { backgroundColor: withOpacity(palette.white, 0.14) }]}
                            accessibilityLabel="Kartı paylaş"
                        >
                            <Ionicons name="share-outline" size={16} color={onCard} />
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            <View style={[st.cardAvatar, { backgroundColor: withOpacity(palette.white, 0.1), borderColor: skin?.photoBorder ?? withOpacity(palette.white, 0.2) }]}>
                {profile.photoURL ? (
                    <Image source={{ uri: profile.photoURL }} style={st.fill} contentFit="cover" />
                ) : (
                    <Text style={[st.cardInitials, { color: onCard }]}>{initials(profile.displayName)}</Text>
                )}
            </View>
            <Text style={[st.cardName, { color: skin?.nameColor ?? onCard }]} numberOfLines={1}>{titleCase(profile.displayName)}</Text>
            {!!tagline && <Text style={[st.cardTag, { color: onCardMuted }]} numberOfLines={1}>{tagline}</Text>}

            {isOwn && vacation && (
                <View style={[st.vacationPill, { backgroundColor: withOpacity(palette.white, 0.14) }]}>
                    <Ionicons name={vacation.type === 'injury' ? 'medkit-outline' : 'airplane-outline'} size={13} color={onCard} />
                    <Text style={[st.vacationText, { color: onCard }]}>
                        {vacation.type === 'injury' ? 'Sakatlık' : 'İzin'} modunda · {vacation.daysRemaining}g kaldı
                    </Text>
                </View>
            )}

            <View style={[st.xpTrack, { backgroundColor: withOpacity(palette.white, 0.16) }]}>
                <View style={[st.xpFill, { width: `${progress * 100}%`, backgroundColor: cardAccent }]} />
            </View>
            <View style={st.xpRow}>
                <TouchableOpacity style={st.row} onPress={() => setInfoModal('xp')} hitSlop={8}>
                    <Text style={[st.xpText, { color: onCardMuted }]}>SEVİYE {level} · {rank.toLocaleUpperCase('tr-TR')}</Text>
                    <Ionicons name="information-circle-outline" size={13} color={onCardMuted} style={{ marginLeft: 4 }} />
                </TouchableOpacity>
                <Text style={[st.xpText, { color: onCardMuted }]}>{currentLevelXp} / {nextLevelXp} XP</Text>
            </View>

            {/* Follow counts are part of the card by request (design had them in a separate card). */}
            <View style={[st.cardDivider, { backgroundColor: withOpacity(palette.white, 0.14) }]} />
            <View style={st.socialRow}>
                <SocialStat value={followersCount} label="TAKİPÇİ" color={onCard} muted={onCardMuted} onPress={() => openFollowList('followers')} />
                <View style={[st.socialSep, { backgroundColor: withOpacity(palette.white, 0.14) }]} />
                <SocialStat value={followingCount} label="TAKİP" color={onCard} muted={onCardMuted} onPress={() => openFollowList('following')} />
                <View style={[st.socialSep, { backgroundColor: withOpacity(palette.white, 0.14) }]} />
                <SocialStat value={canSeeStats ? `%${winRate}` : '—'} label="GALİBİYET" color={onCard} muted={onCardMuted} />
            </View>
        </LinearGradient>
    );

    /* ─────────────────────────── Render ─────────────────────────── */
    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {background}
            {header}

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: isTabRoot ? 120 : insets.bottom + 24, gap: 16 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchData(true); }} tintColor={C.primaryText} />}
            >
                {isOwn && !isEmailVerified && !emailBannerDismissed && (
                    <View style={[st.banner, { backgroundColor: withOpacity(C.warning, 0.12), borderColor: withOpacity(C.warning, 0.4) }]}>
                        <Ionicons name="mail-unread-outline" size={20} color={C.warning} />
                        <Text style={[st.bannerText, { color: C.text }]}>E-posta adresini doğrula</Text>
                        <TouchableOpacity
                            onPress={handleSendVerificationEmail}
                            disabled={sendingVerification}
                            style={[st.bannerBtn, { backgroundColor: C.warning }]}
                        >
                            {sendingVerification
                                ? <ActivityIndicator size="small" color={C.onPrimary} />
                                : <Text style={[st.bannerBtnText, { color: C.onPrimary }]}>Doğrula</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setEmailBannerDismissed(true)} hitSlop={8}>
                            <Ionicons name="close" size={18} color={C.textSecondary} />
                        </TouchableOpacity>
                    </View>
                )}

                {playerCard}

                {/* Primary action */}
                {isOwn ? (
                    <TouchableOpacity
                        onPress={() => router.push('/edit-profile')}
                        activeOpacity={0.8}
                        style={[st.actionBtn, { backgroundColor: C.card, borderColor: C.border, borderWidth: 1 }]}
                    >
                        <Ionicons name="create-outline" size={18} color={C.text} />
                        <Text style={[st.actionText, { color: C.text }]}>Profili Düzenle</Text>
                    </TouchableOpacity>
                ) : user ? (
                    <TouchableOpacity
                        onPress={handleFollowToggle}
                        disabled={followLoading}
                        activeOpacity={0.8}
                        style={[
                            st.actionBtn,
                            isFollowing
                                ? { backgroundColor: C.card, borderColor: C.border, borderWidth: 1 }
                                : { backgroundColor: C.primary },
                        ]}
                    >
                        {followLoading ? (
                            <ActivityIndicator size="small" color={isFollowing ? C.text : C.onPrimary} />
                        ) : (
                            <>
                                <Ionicons name={isFollowing ? 'checkmark' : 'person-add-outline'} size={18} color={isFollowing ? C.text : C.onPrimary} />
                                <Text style={[st.actionText, { color: isFollowing ? C.text : C.onPrimary }]}>
                                    {isFollowing ? 'Takiptesin' : 'Takip Et'}
                                </Text>
                            </>
                        )}
                    </TouchableOpacity>
                ) : null}

                {/* Stat grid */}
                <TouchableOpacity activeOpacity={canSeeStats ? 1 : 0.7} disabled={canSeeStats} onPress={goPremium} style={st.statGrid}>
                    {[
                        { label: 'MAÇ', value: stats.matchesPlayed },
                        { label: 'GOL', value: stats.goals },
                        { label: 'ASİST', value: stats.assists },
                        { label: 'MVP', value: stats.motmCount },
                    ].map(s => (
                        <View key={s.label} style={[st.statBox, { backgroundColor: C.card, borderColor: C.border }]}>
                            {canSeeStats
                                ? <Text style={[st.statNum, { color: C.text }]}>{s.value}</Text>
                                : <Ionicons name="lock-closed" size={18} color={C.gold} style={{ marginVertical: 2 }} />}
                            <Text style={[st.statLbl, { color: C.textSecondary }]}>{s.label}</Text>
                        </View>
                    ))}
                </TouchableOpacity>

                {/* Form card */}
                <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                    <View style={st.cardHead}>
                        <View style={st.row}>
                            <Text style={[st.eyebrow, { color: C.textSecondary }]}>Form Grafiği</Text>
                            {canSeeForm && (
                                <TouchableOpacity onPress={() => setInfoModal('form')} hitSlop={8} style={{ marginLeft: 6 }}>
                                    <Ionicons name="information-circle-outline" size={15} color={C.textTertiary} />
                                </TouchableOpacity>
                            )}
                        </View>
                        {canSeeForm && recentRatings.length >= 2 && (
                            <View style={[st.pill, { backgroundColor: withOpacity(trendInfo.color, 0.14) }]}>
                                <Ionicons name={trendInfo.icon} size={13} color={trendInfo.color} />
                                <Text style={[st.pillText, { color: trendInfo.color }]}>{trendInfo.text}</Text>
                            </View>
                        )}
                    </View>

                    {!canSeeForm ? (
                        <View style={st.emptyBlock}>
                            <Ionicons name="lock-closed-outline" size={24} color={C.gold} />
                            <Text style={[st.emptyText, { color: C.textSecondary }]}>Form grafiği Oyuncu Pro özelliğidir</Text>
                            <TouchableOpacity onPress={goPremium} style={[st.smallBtn, { backgroundColor: C.primary }]}>
                                <Text style={[st.smallBtnText, { color: C.onPrimary }]}>Pro'ya Yükselt</Text>
                            </TouchableOpacity>
                        </View>
                    ) : recentRatings.length === 0 ? (
                        <View style={st.emptyBlock}>
                            <Ionicons name="pulse-outline" size={24} color={C.textTertiary} />
                            <Text style={[st.emptyText, { color: C.textSecondary }]}>Henüz yeterli maç verisi yok</Text>
                        </View>
                    ) : (
                        <>
                            {/* Oldest → newest, left to right */}
                            <FormLineChart values={[...recentRatings].reverse()} color={C.isDark ? palette.greenBright : C.primary} />
                            <View style={st.cardFoot}>
                                <Text style={[st.footText, { color: C.textTertiary }]}>Son {recentRatings.length} maç</Text>
                                <Text style={[st.footText, { color: C.textSecondary, fontWeight: '700' }]}>Ort. {avgRating.toFixed(1)}</Text>
                            </View>
                        </>
                    )}
                </View>

                {/* Debts (own) */}
                {isOwn && debts.length > 0 && (
                    <TouchableOpacity
                        onPress={() => router.push('/debts')}
                        activeOpacity={0.8}
                        style={[st.card, st.debtCard, { backgroundColor: C.card, borderColor: withOpacity(C.error, 0.35) }]}
                    >
                        <View style={[st.debtIcon, { backgroundColor: withOpacity(C.error, 0.12) }]}>
                            <Ionicons name="wallet-outline" size={20} color={C.error} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[st.eyebrow, { color: C.textSecondary }]}>Ödenmemiş Borç</Text>
                            <Text style={[st.debtSub, { color: C.textTertiary }]}>{debts.length} maç</Text>
                        </View>
                        <Text style={[st.debtAmount, { color: C.error }]}>{totalDebt} ₺</Text>
                        <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
                    </TouchableOpacity>
                )}

                {isOwn && <AdBanner placement="profile" />}

                {/* Recent matches */}
                <View>
                    <View style={st.sectionHead}>
                        <Text style={[st.eyebrow, { color: C.textSecondary }]}>{isOwn ? 'Son Maçlar' : 'Son Maçları'}</Text>
                        {matches.length > 3 && (
                            <TouchableOpacity
                                hitSlop={8}
                                onPress={() => {
                                    if (isOwn) router.push('/(tabs)/matches');
                                    else if (canSeeFullStats) router.push(`/user/${targetId}/matches` as any);
                                    else alert('Premium Özellik 👑', 'Tüm maç geçmişini görmek için Premium aboneliğe geç.', [
                                        { text: 'İptal', style: 'cancel' },
                                        { text: "Premium'a Geç", onPress: goPremium },
                                    ]);
                                }}
                            >
                                <Text style={[st.link, { color: C.link }]}>Tümünü Gör</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    {matches.length === 0 ? (
                        <Text style={[st.emptyText, { color: C.textSecondary, textAlign: 'left' }]}>Henüz maç oynanmadı.</Text>
                    ) : (
                        <View style={{ gap: 10 }}>
                            {matches.slice(0, 3).map((m, i) => {
                                const { result } = outcomes[i];
                                const resultColor = result === 'win' ? C.link : result === 'loss' ? C.error : C.textSecondary;
                                const resultText = result === 'win' ? 'Kazandı' : result === 'loss' ? 'Kaybetti' : result === 'draw' ? 'Berabere' : 'Skor yok';
                                return (
                                    <TouchableOpacity
                                        key={m.id}
                                        onPress={() => router.push(`/match/${m.id}`)}
                                        activeOpacity={0.8}
                                        style={[st.card, st.matchCard, { backgroundColor: C.card, borderColor: C.border }]}
                                    >
                                        <View style={st.matchTop}>
                                            <Text style={[st.matchVenue, { color: C.text }]} numberOfLines={1}>{m.venue || 'Maç'}</Text>
                                            <Text style={[st.matchResult, { color: resultColor }]}>
                                                {result ? `${m.scoreA}-${m.scoreB} ` : ''}{resultText}
                                            </Text>
                                        </View>
                                        <Text style={[st.matchDate, { color: C.textTertiary }]}>
                                            {format(toDate(m.date), 'd MMMM', { locale: tr })}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </View>

                {/* Groups (own) */}
                {isOwn && (
                    <View>
                        <View style={st.sectionHead}>
                            <Text style={[st.eyebrow, { color: C.textSecondary }]}>Gruplarım</Text>
                            <TouchableOpacity hitSlop={8} onPress={() => router.push('/(tabs)/groups')}>
                                <Text style={[st.link, { color: C.link }]}>Tümü</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12 }}>
                            {groups.map(g => (
                                <TouchableOpacity key={g.id} onPress={() => router.push(`/group/${g.id}`)} style={st.groupItem}>
                                    <View style={[st.groupAvatar, { backgroundColor: C.card, borderColor: C.border }]}>
                                        {g.photoURL
                                            ? <Image source={{ uri: g.photoURL }} style={st.fill} />
                                            : <Ionicons name="people" size={22} color={C.primaryText} />}
                                    </View>
                                    <Text style={[st.groupName, { color: C.textSecondary }]} numberOfLines={1}>{g.name}</Text>
                                </TouchableOpacity>
                            ))}
                            <TouchableOpacity onPress={() => router.push('/create-group')} style={st.groupItem}>
                                <View style={[st.groupAvatar, st.groupAdd, { borderColor: C.textTertiary }]}>
                                    <Ionicons name="add" size={24} color={C.textSecondary} />
                                </View>
                                <Text style={[st.groupName, { color: C.textSecondary }]} numberOfLines={1}>Grup oluştur</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                )}
            </ScrollView>

            {/* Follow list */}
            <Modal visible={!!followModal} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setFollowModal(null)}>
                <View style={{ flex: 1, backgroundColor: C.sheet }}>
                    <View style={[st.sheetHead, { borderBottomColor: C.divider }]}>
                        <Text style={[st.sheetTitle, { color: C.text }]}>{followModal === 'followers' ? 'Takipçiler' : 'Takip Edilenler'}</Text>
                        <TouchableOpacity onPress={() => setFollowModal(null)} hitSlop={10}>
                            <Ionicons name="close" size={24} color={C.text} />
                        </TouchableOpacity>
                    </View>
                    {listLoading ? (
                        <View style={st.center}><ActivityIndicator size="large" color={C.primaryText} /></View>
                    ) : (
                        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }}>
                            {followList.length === 0 ? (
                                <Text style={[st.emptyText, { color: C.textSecondary, marginTop: 40 }]}>Kullanıcı bulunamadı.</Text>
                            ) : followList.map((item: any) => {
                                const ovr = item.overall || item.overallRating;
                                return (
                                    <TouchableOpacity
                                        key={item.uid}
                                        onPress={() => { setFollowModal(null); router.push(`/user/${item.uid}`); }}
                                        style={[st.listItem, { backgroundColor: C.card, borderColor: C.border }]}
                                    >
                                        <View style={[st.listAvatar, { backgroundColor: C.iconTile }]}>
                                            {item.photoURL
                                                ? <Image source={{ uri: item.photoURL }} style={st.fill} />
                                                : <Text style={[st.listInitial, { color: C.primaryText }]}>{item.displayName?.[0]?.toUpperCase() || 'U'}</Text>}
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={[st.listName, { color: C.text }]} numberOfLines={1}>{item.displayName || 'İsimsiz Kullanıcı'}</Text>
                                            <Text style={[st.listSub, { color: C.textSecondary }]} numberOfLines={1}>{item.username ? `@${item.username}` : (item.position || 'Oyuncu')}</Text>
                                        </View>
                                        {!!ovr && (
                                            <View style={[st.pill, { backgroundColor: withOpacity(C.accent, 0.12) }]}>
                                                <Text style={[st.pillText, { color: C.link }]}>OVR {ovr}</Text>
                                            </View>
                                        )}
                                        <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    )}
                </View>
            </Modal>

            {/* Share card (own) */}
            <Modal visible={showShareCard} transparent animationType="fade" onRequestClose={() => setShowShareCard(false)}>
                <View style={[st.shareBackdrop, { backgroundColor: withOpacity(palette.black, 0.85) }]}>
                    <TouchableOpacity style={[st.shareClose, { top: insets.top + 16 }]} onPress={() => setShowShareCard(false)} hitSlop={10}>
                        <Ionicons name="close" size={28} color={palette.white} />
                    </TouchableOpacity>
                    <StatsShareCard
                        stats={{
                            displayName: profile.displayName || 'OYUNCU',
                            goals: stats.goals,
                            assists: stats.assists,
                            matchesPlayed: stats.matchesPlayed,
                            wins: stats.wins,
                            motmCount: stats.motmCount,
                            overall: Math.round(overall),
                            position: profile.position,
                            photoURL: profile.photoURL,
                            nickname: profile.nickname,
                            preferredFoot: profile.preferredFoot,
                            followers: followersCount,
                            following: followingCount,
                        }}
                        theme={profile.cardTheme || 'varsayilan'}
                        canSeeOverall={canSeeOverall}
                    />
                </View>
            </Modal>

            {/* Block / report sheet */}
            <Modal visible={showActionMenu} transparent animationType="fade" onRequestClose={() => setShowActionMenu(false)}>
                <Pressable style={[st.sheetBackdrop, { backgroundColor: C.overlay }]} onPress={() => setShowActionMenu(false)}>
                    <Pressable style={[st.actionSheet, { backgroundColor: C.sheet, borderColor: C.border, paddingBottom: insets.bottom + 16 }]}>
                        <View style={[st.grabber, { backgroundColor: C.textTertiary }]} />
                        <TouchableOpacity style={[st.sheetRow, { borderBottomColor: C.divider }]} onPress={confirmBlock}>
                            <Ionicons name="ban-outline" size={21} color={C.error} />
                            <Text style={[st.sheetRowText, { color: C.error }]}>Kullanıcıyı Engelle</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[st.sheetRow, { borderBottomColor: C.divider }]} onPress={() => { setShowActionMenu(false); setShowReportModal(true); }}>
                            <Ionicons name="flag-outline" size={21} color={C.warning} />
                            <Text style={[st.sheetRowText, { color: C.warning }]}>Kullanıcıyı Şikayet Et</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={st.sheetCancel} onPress={() => setShowActionMenu(false)}>
                            <Text style={[st.sheetRowText, { color: C.textSecondary }]}>İptal</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>

            {/* Report reasons */}
            <Modal visible={showReportModal} transparent animationType="fade" onRequestClose={() => setShowReportModal(false)}>
                <Pressable style={[st.dialogBackdrop, { backgroundColor: C.overlay }]} onPress={() => setShowReportModal(false)}>
                    <Pressable style={[st.dialog, { backgroundColor: C.sheet, borderColor: C.border }]}>
                        <Text style={[st.dialogTitle, { color: C.text }]}>Şikayet Sebebi</Text>
                        {REPORT_REASONS.map(reason => (
                            <TouchableOpacity
                                key={reason.value}
                                onPress={() => submitReport(reason.value as ReportReason)}
                                style={[st.reasonRow, { borderBottomColor: C.divider }]}
                            >
                                <Text style={[st.reasonText, { color: C.text }]}>{reason.label}</Text>
                            </TouchableOpacity>
                        ))}
                        <TouchableOpacity onPress={() => setShowReportModal(false)} style={st.sheetCancel}>
                            <Text style={[st.sheetRowText, { color: C.textSecondary }]}>İptal</Text>
                        </TouchableOpacity>
                    </Pressable>
                </Pressable>
            </Modal>

            <InfoDialog
                visible={infoModal === 'xp'}
                onClose={() => setInfoModal(null)}
                title="Seviye & XP Kuralları"
                intro="Maçlarda gösterdiğin performansa göre XP kazanarak seviye atlarsın:"
                rows={[
                    { label: 'Katılım', value: '+100 XP' },
                    { label: 'Galibiyet', value: '+100 XP' },
                    { label: 'Gol', value: '+50 XP' },
                    { label: 'Asist', value: '+30 XP' },
                    { label: 'Gol Yememe', value: '+50 XP' },
                    { label: 'MVP', value: '+150 XP' },
                ]}
                footer="XP kazandıkça unvanın değişir ve yeni kart tasarımları açılır!"
                C={C}
            />
            <InfoDialog
                visible={infoModal === 'form'}
                onClose={() => setInfoModal(null)}
                title="Form Puanı Nasıl Hesaplanır?"
                intro="Her maç için 1-10 arası bir performans puanı hesaplanır:"
                rows={[
                    { label: 'Taban puan', value: '5.0' },
                    { label: 'Gol', value: '+1.5 / gol (max +3.0)' },
                    { label: 'Asist', value: '+1.0 / asist (max +2.0)' },
                    { label: 'Galibiyet', value: '+1.0' },
                    { label: 'Clean sheet', value: '+0.5' },
                    { label: 'MVP seçilme', value: '+0.5' },
                ]}
                footer="Grafik son 10 maçını, trend ise son maçını önceki 3 maçla karşılaştırır."
                C={C}
            />
            <InfoDialog
                visible={infoModal === 'overall'}
                onClose={() => setInfoModal(null)}
                title="Overall Detayları"
                intro="Overall puanın, gruplarındaki değerlendirmeler ve performansına göre hesaplanır:"
                rows={overallRows(profile.overallBreakdown)}
                footer="Toplam = Grup Ort. + Bonuslar (40-99 arası)"
                C={C}
            />
        </View>
    );
}

function overallRows(breakdown: any = {}) {
    const signed = (v: number | undefined, digits = 0) =>
        v === undefined ? '0' : `${v >= 0 ? '+' : ''}${digits ? v.toFixed(digits) : Math.round(v)}`;
    return [
        { label: 'Grup Ortalaması', value: breakdown.averageBase !== undefined ? String(Math.round(breakdown.averageBase)) : '-' },
        { label: 'Form Bonusu', value: signed(breakdown.formBonus) },
        { label: 'Aktivite Bonusu', value: signed(breakdown.activityBonus) },
        { label: 'MVP Bonusu', value: signed(breakdown.mvpBonus, 1) },
        { label: 'Galibiyet Bonusu', value: signed(breakdown.winRateBonus) },
    ];
}

function SocialStat({ value, label, color, muted, onPress }: { value: number | string; label: string; color: string; muted: string; onPress?: () => void }) {
    const content = (
        <>
            <Text style={[st.socialNum, { color }]}>{value}</Text>
            <Text style={[st.socialLbl, { color: muted }]}>{label}</Text>
        </>
    );
    return onPress
        ? <TouchableOpacity style={st.socialStat} onPress={onPress} activeOpacity={0.7}>{content}</TouchableOpacity>
        : <View style={st.socialStat}>{content}</View>;
}

function InfoDialog({ visible, onClose, title, intro, rows, footer, C }: {
    visible: boolean;
    onClose: () => void;
    title: string;
    intro: string;
    rows: { label: string; value: string }[];
    footer: string;
    C: SettingsColors;
}): ReactNode {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <Pressable style={[st.dialogBackdrop, { backgroundColor: C.overlay }]} onPress={onClose}>
                <Pressable style={[st.dialog, { backgroundColor: C.sheet, borderColor: C.border }]}>
                    <View style={st.cardHead}>
                        <Text style={[st.dialogTitle, { color: C.text, marginBottom: 0, flex: 1, textAlign: 'left' }]}>{title}</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={10}>
                            <Ionicons name="close" size={22} color={C.textSecondary} />
                        </TouchableOpacity>
                    </View>
                    <Text style={[st.dialogIntro, { color: C.textSecondary }]}>{intro}</Text>
                    {rows.map(r => (
                        <View key={r.label} style={[st.infoRow, { borderBottomColor: C.divider }]}>
                            <Text style={[st.infoLabel, { color: C.text }]}>{r.label}</Text>
                            <Text style={[st.infoValue, { color: C.link }]}>{r.value}</Text>
                        </View>
                    ))}
                    <View style={[st.dialogFooter, { backgroundColor: withOpacity(C.accent, 0.08) }]}>
                        <Text style={[st.dialogFooterText, { color: C.link }]}>{footer}</Text>
                    </View>
                </Pressable>
            </Pressable>
        </Modal>
    );
}

/** Form line chart (design: Profilim › Form Grafiği) — polyline with a soft area fill. */
function FormLineChart({ values, color, height = 64 }: { values: number[]; color: string; height?: number }) {
    const [width, setWidth] = useState(0);
    const pad = 6;
    // A single match still reads as a line: repeat it across the width.
    const series = values.length === 1 ? [values[0], values[0]] : values;
    const min = Math.max(0, Math.min(...series) - 0.5);
    const max = Math.min(10, Math.max(...series) + 0.5);
    const range = Math.max(0.5, max - min);
    const points = series.map((v, i) => ({
        x: pad + (i / (series.length - 1)) * (width - pad * 2),
        y: pad + (1 - (v - min) / range) * (height - pad * 2),
    }));
    const last = points[points.length - 1];
    const line = points.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
    const area = `M${points[0].x.toFixed(1)},${height} ${points.map(p => `L${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')} L${last.x.toFixed(1)},${height} Z`;

    return (
        <View style={{ height, marginTop: 4 }} onLayout={e => setWidth(e.nativeEvent.layout.width)}>
            {width > 0 && (
                <Svg width={width} height={height}>
                    <Defs>
                        <SvgLinearGradient id="formFill" x1="0" y1="0" x2="0" y2="1">
                            <Stop offset="0" stopColor={color} stopOpacity={0.22} />
                            <Stop offset="1" stopColor={color} stopOpacity={0} />
                        </SvgLinearGradient>
                    </Defs>
                    <Path d={area} fill="url(#formFill)" />
                    <Polyline points={line} fill="none" stroke={color} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
                    <Circle cx={last.x} cy={last.y} r={4.5} fill={color} />
                </Svg>
            )}
        </View>
    );
}

const st = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    row: { flexDirection: 'row', alignItems: 'center' },
    fill: { width: '100%', height: '100%' },

    header: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 14 },
    title: { flex: 1, fontSize: 22, fontWeight: '800', letterSpacing: -0.4 },
    titleLarge: { flex: 1, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
    roundBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

    banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, borderWidth: 1 },
    bannerText: { flex: 1, fontSize: 13, fontWeight: '600' },
    bannerBtn: { height: 32, minWidth: 76, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    bannerBtnText: { fontSize: 12.5, fontWeight: '700' },

    playerCard: { borderRadius: 24, borderWidth: 1, padding: 22, overflow: 'hidden' },
    cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
    cardTopRight: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    ovr: { fontSize: 44, fontWeight: '800', lineHeight: 46 },
    ovrLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 0.9, marginTop: 2 },
    posPill: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
    posText: { fontSize: 12, fontWeight: '800' },
    cardIconBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
    cardAvatar: { width: 96, height: 96, borderRadius: 20, borderWidth: 1.5, alignSelf: 'center', marginTop: 10, marginBottom: 10, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    cardInitials: { fontSize: 32, fontWeight: '800' },
    cardName: { textAlign: 'center', fontSize: 20, fontWeight: '800' },
    cardTag: { textAlign: 'center', fontSize: 12, fontWeight: '600', marginTop: 3 },
    vacationPill: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'center', marginTop: 10, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    vacationText: { fontSize: 11.5, fontWeight: '700' },
    xpTrack: { height: 6, borderRadius: 3, marginTop: 16, overflow: 'hidden' },
    xpFill: { height: '100%', borderRadius: 3 },
    xpRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 7 },
    xpText: { fontSize: 11, fontWeight: '700' },
    cardDivider: { height: StyleSheet.hairlineWidth, marginTop: 16, marginBottom: 12 },
    socialRow: { flexDirection: 'row', alignItems: 'center' },
    socialStat: { flex: 1, alignItems: 'center', paddingVertical: 2 },
    socialSep: { width: StyleSheet.hairlineWidth, height: 28 },
    socialNum: { fontSize: 18, fontWeight: '800' },
    socialLbl: { fontSize: 10.5, fontWeight: '700', marginTop: 2, letterSpacing: 0.3 },

    actionBtn: { height: 50, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
    actionText: { fontSize: 15, fontWeight: '700' },

    statGrid: { flexDirection: 'row', gap: 10 },
    statBox: { flex: 1, borderRadius: 16, borderWidth: 1, paddingVertical: 14, paddingHorizontal: 4, alignItems: 'center' },
    statNum: { fontSize: 20, fontWeight: '800' },
    statLbl: { fontSize: 10.5, fontWeight: '600', marginTop: 2 },

    card: { borderRadius: 20, borderWidth: 1, padding: 18 },
    cardHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    cardFoot: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
    footText: { fontSize: 11, fontWeight: '600' },
    eyebrow: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
    pillText: { fontSize: 12, fontWeight: '700' },
    emptyBlock: { alignItems: 'center', paddingVertical: 12, gap: 8 },
    emptyText: { fontSize: 13, fontWeight: '500', textAlign: 'center' },
    smallBtn: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 10, marginTop: 4 },
    smallBtnText: { fontSize: 12.5, fontWeight: '700' },

    debtCard: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14 },
    debtIcon: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    debtSub: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },
    debtAmount: { fontSize: 18, fontWeight: '800' },

    sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
    link: { fontSize: 12.5, fontWeight: '700' },
    matchCard: { padding: 14 },
    matchTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 },
    matchVenue: { flex: 1, fontSize: 13.5, fontWeight: '700' },
    matchResult: { fontSize: 13, fontWeight: '800' },
    matchDate: { fontSize: 11.5, fontWeight: '600', marginTop: 3 },

    groupItem: { width: 72, alignItems: 'center' },
    groupAvatar: { width: 56, height: 56, borderRadius: 18, borderWidth: 1, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    groupAdd: { borderStyle: 'dashed', borderWidth: 1.5 },
    groupName: { fontSize: 11, fontWeight: '600', marginTop: 5, textAlign: 'center' },

    sheetHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: StyleSheet.hairlineWidth },
    sheetTitle: { fontSize: 17, fontWeight: '800' },
    listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 16, borderWidth: 1 },
    listAvatar: { width: 44, height: 44, borderRadius: 14, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    listInitial: { fontSize: 16, fontWeight: '800' },
    listName: { fontSize: 15, fontWeight: '700' },
    listSub: { fontSize: 11.5, marginTop: 2 },

    shareBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
    shareClose: { position: 'absolute', right: 20, zIndex: 10 },

    sheetBackdrop: { flex: 1, justifyContent: 'flex-end' },
    actionSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, padding: 16 },
    grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12, opacity: 0.5 },
    sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 15, borderBottomWidth: StyleSheet.hairlineWidth },
    sheetRowText: { fontSize: 15, fontWeight: '600' },
    sheetCancel: { paddingVertical: 15, alignItems: 'center' },

    dialogBackdrop: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
    dialog: { width: '100%', maxWidth: 360, borderRadius: 24, borderWidth: 1, padding: 20 },
    dialogTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center', marginBottom: 12 },
    dialogIntro: { fontSize: 13, lineHeight: 19, marginBottom: 8 },
    reasonRow: { paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
    reasonText: { fontSize: 14, fontWeight: '500' },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, gap: 12 },
    infoLabel: { fontSize: 13, fontWeight: '600' },
    infoValue: { fontSize: 13, fontWeight: '700' },
    dialogFooter: { borderRadius: 12, padding: 10, marginTop: 14 },
    dialogFooterText: { fontSize: 11.5, fontWeight: '600', textAlign: 'center' },
});
