import { Ionicons } from '@expo/vector-icons';
import { format, isToday, isTomorrow } from 'date-fns';
import { tr } from 'date-fns/locale';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { ReactNode, useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '../../components/CustomAlertProvider';
import { GroupAnalytics, calculateGroupAnalytics } from '../../components/GroupAnalytics';
import { Avatar, Eyebrow, FinBox, Pill, PrimaryButton, SecondaryButton, Sheet, SheetRow, TabStrip, compactName, formatTL, toDate } from '../../components/group/GroupUI';
import { useSettingsColors } from '../../components/settings/SettingsUI';
import { SwipePager } from '../../components/ui/SwipePager';
import { palette, withOpacity } from '../../constants/designTokens';
import { useAuth } from '../../context/AuthContext';
import { usePremium } from '../../context/PremiumContext';
import { addGroupAdmin, checkJoinRequestStatus, deleteGroup, getGroupDetails, getGroupMatches, getGroupRequests, getMatchParticipants, getUserProfile, joinGroup, removeFromGroup, removeGroupAdmin, removeGroupMember, requestToJoinGroup, respondToGroupRequest, searchUserByEmail, searchUsersByUsername, sendGroupInvite, updateGroup } from '../../services/firestore';
import { uploadImage } from '../../services/storageService';

/**
 * Layout: design/tasarım/macvar-screens-2.html (Grup Detayı); colors from designTokens.
 * Deviations by request: the member list opens from "N üye" instead of a tab, group analytics live on
 * "Genel", Borçlar is admin-only, and an "İstatistik" tab keeps the group rankings reachable.
 */

type Tab = 'genel' | 'istatistik' | 'borclar' | 'gecmis';
type SheetKind = 'manage' | 'more' | 'invite' | 'members' | 'member' | 'requests' | 'privacy' | 'rename' | 'photo' | null;

const POSITION_CODES: Record<string, string> = { GK: 'GK', DEF: 'DEF', MID: 'MID', FWD: 'FWD', Kaleci: 'GK', Defans: 'DEF', 'Orta Saha': 'MID', Forvet: 'FWD' };
const EMPTY_STATS = { goals: 0, assists: 0, wins: 0, matchesPlayed: 0, motmCount: 0, cleanSheets: 0 };
const BATCH_SIZE = 10;

const matchWhen = (date: Date) => {
    const day = isToday(date) ? 'Bugün' : isTomorrow(date) ? 'Yarın' : format(date, 'd MMMM EEEE', { locale: tr });
    return `${day} ${format(date, 'HH:mm')}`;
};

export default function GroupDetailsScreen() {
    const { alert } = useAlert();
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { user } = useAuth();
    const { canSeeAllRankings, visibleRankingCount, tier } = usePremium();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    const [group, setGroup] = useState<any>(null);
    const [matches, setMatches] = useState<any[]>([]);
    const [participantsMap, setParticipantsMap] = useState<Record<string, any[]>>({});
    const [groupStats, setGroupStats] = useState<Record<string, typeof EMPTY_STATS>>({});
    const [groupRequests, setGroupRequests] = useState<any[]>([]);
    const [joinRequestStatus, setJoinRequestStatus] = useState<'none' | 'pending'>('none');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    // Upcoming/past split is anchored to the last load so render stays pure.
    const [now, setNow] = useState(() => Date.now());

    const [tab, setTab] = useState<Tab>('genel');
    // Follows the horizontal swipe so the tab underline slides with the finger.
    const tabProgress = useSharedValue(0);
    const [sheet, setSheet] = useState<SheetKind>(null);
    const [selectedMember, setSelectedMember] = useState<any>(null);
    const [newGroupName, setNewGroupName] = useState('');
    const [expandedRankings, setExpandedRankings] = useState<Record<string, boolean>>({});
    const [joiningGroup, setJoiningGroup] = useState(false);
    const [uploadingPhoto, setUploadingPhoto] = useState(false);

    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<any[]>([]);
    const [searched, setSearched] = useState(false);
    const [searchLoading, setSearchLoading] = useState(false);
    const [inviteLoading, setInviteLoading] = useState<string | null>(null);

    const closeSheet = () => setSheet(null);

    const loadMemberDetails = async (memberIds: string[]) => {
        const profiles = await Promise.all(memberIds.map(uid => getUserProfile(uid).catch(() => null)));
        return profiles.map((p: any, i) => (p ? { ...p, uid: p.uid || memberIds[i] } : { uid: memberIds[i], displayName: 'Bilinmeyen Kullanıcı' }));
    };

    const loadGroup = async () => {
        if (!id) return;
        try {
            const [groupData, matchesData]: [any, any[]] = await Promise.all([getGroupDetails(id), getGroupMatches(id)]);
            if (!groupData) {
                setGroup(null);
                return;
            }
            const members: string[] = groupData.members || [];
            const groupAdmins: string[] = groupData.admins || (groupData.adminId ? [groupData.adminId] : []);
            const userIsAdmin = !!user && (groupData.adminId === user.uid || groupAdmins.includes(user.uid));

            const [memberDetails, requestStatus, requests] = await Promise.all([
                loadMemberDetails(members),
                user && !members.includes(user.uid) ? checkJoinRequestStatus(id, user.uid) : Promise.resolve('none' as const),
                userIsAdmin ? getGroupRequests(id) : Promise.resolve([]),
            ]);

            const sorted = [...matchesData].sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());

            // Participants drive upcoming counts, debts and the group-only stats.
            const pMap: Record<string, any[]> = {};
            for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
                const batch = sorted.slice(i, i + BATCH_SIZE);
                const results = await Promise.all(batch.map(m => getMatchParticipants(m.id).catch(() => [])));
                batch.forEach((m, idx) => { pMap[m.id] = results[idx]; });
            }

            const statsMap: Record<string, typeof EMPTY_STATS> = {};
            const bump = (uid: string) => (statsMap[uid] ??= { ...EMPTY_STATS });
            sorted.filter(m => m.status === 'FINISHED').forEach(match => {
                (pMap[match.id] || []).filter((p: any) => p.status === 'IN' && p.userId).forEach((p: any) => {
                    const s = bump(p.userId);
                    const won = match.scoreA !== undefined && match.scoreB !== undefined &&
                        ((p.team === 'A' && match.scoreA > match.scoreB) || (p.team === 'B' && match.scoreB > match.scoreA));
                    s.matchesPlayed += 1;
                    s.goals += p.goals || 0;
                    s.assists += p.assists || 0;
                    if (won) s.wins += 1;
                    if (p.cleanSheet === true) s.cleanSheets += 1;
                });
                if (match.motm) bump(match.motm).motmCount += 1;
            });

            setNow(Date.now());
            setGroup({ ...groupData, memberDetails });
            setNewGroupName(groupData.name || '');
            setJoinRequestStatus(requestStatus as 'none' | 'pending');
            setGroupRequests(requests);
            setMatches(sorted);
            setParticipantsMap(pMap);
            setGroupStats(statsMap);
        } catch (err) {
            console.error('Error loading group:', err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadGroup();
        }, [id, user?.uid])
    );

    /* ─────────────────────────── Actions ─────────────────────────── */

    const pickImage = async () => {
        closeSheet();
        try {
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            if (status !== 'granted') {
                alert('İzin Gerekli', 'Fotoğraf yüklemek için galeri iznine ihtiyacımız var.', [], { type: 'warning' });
                return;
            }
            const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
            if (result.canceled || !result.assets[0]) return;
            setUploadingPhoto(true);
            const url = await uploadImage(result.assets[0].uri, 'group', id);
            if (!url) throw new Error('upload failed');
            await updateGroup(id, { photoURL: url });
            setGroup((prev: any) => ({ ...prev, photoURL: url }));
        } catch (error) {
            console.error(error);
            alert('Hata', 'Fotoğraf yüklenemedi', [], { type: 'error' });
        } finally {
            setUploadingPhoto(false);
        }
    };

    const removePhoto = async () => {
        closeSheet();
        try {
            await updateGroup(id, { photoURL: '' });
            setGroup((prev: any) => ({ ...prev, photoURL: '' }));
        } catch {
            alert('Hata', 'Fotoğraf kaldırılamadı', [], { type: 'error' });
        }
    };

    const handleJoinGroup = async () => {
        if (joiningGroup || !user) return;
        setJoiningGroup(true);
        try {
            if (group?.privacy === 'private') {
                await requestToJoinGroup(id, user.uid);
                setJoinRequestStatus('pending');
                alert('İstek Gönderildi', 'Katılım isteğin yöneticiye iletildi.', [], { type: 'success' });
            } else {
                await joinGroup(id, user.uid);
                const [profile] = await loadMemberDetails([user.uid]);
                setGroup((prev: any) => ({ ...prev, members: [...prev.members, user.uid], memberDetails: [...prev.memberDetails, profile] }));
                alert('Başarılı', 'Gruba katıldın!', [], { type: 'success' });
            }
        } catch (error) {
            console.error(error);
            alert('Hata', 'İşlem başarısız oldu', [], { type: 'error' });
        } finally {
            setJoiningGroup(false);
        }
    };

    const handleRespondRequest = async (reqId: string, userId: string, action: 'approve' | 'reject') => {
        try {
            await respondToGroupRequest(reqId, id, userId, action);
            setGroupRequests(prev => prev.filter(r => r.id !== reqId));
            if (action === 'approve') {
                const [profile] = await loadMemberDetails([userId]);
                setGroup((prev: any) => ({ ...prev, members: [...prev.members, userId], memberDetails: [...prev.memberDetails, profile] }));
            }
        } catch (error) {
            console.error(error);
            alert('Hata', 'İşlem gerçekleştirilemedi', [], { type: 'error' });
        }
    };

    const shareGroupLink = async () => {
        closeSheet();
        try {
            await Share.share({ message: `Halısaha grubuma katıl "${group?.name}": halisahaapp://group/${id}` });
        } catch (error) {
            console.log(error);
        }
    };

    const openInvite = () => {
        setSearchQuery('');
        setSearchResults([]);
        setSearched(false);
        setSheet('invite');
    };

    const handleSearchUsers = async () => {
        const q = searchQuery.trim();
        if (!q) return;
        setSearchLoading(true);
        try {
            let results: any[] = q.includes('@') ? [await searchUserByEmail(q)].filter(Boolean) : await searchUsersByUsername(q);
            const memberIds: string[] = group?.members || [];
            results = results.filter(u => !memberIds.includes(u.uid));
            setSearchResults(results);
            setSearched(true);
        } catch (error) {
            console.error(error);
            alert('Hata', 'Kullanıcı aranırken hata oluştu', [], { type: 'error' });
        } finally {
            setSearchLoading(false);
        }
    };

    const handleSendGroupInvite = async (target: any) => {
        if (!user) return;
        setInviteLoading(target.uid);
        try {
            const profile: any = await getUserProfile(user.uid);
            await sendGroupInvite(id, group?.name || 'Grup', user.uid, profile?.displayName || 'Bir kullanıcı', target.uid);
            setSearchResults(prev => prev.filter(u => u.uid !== target.uid));
            alert('Davet Gönderildi', `${target.displayName || target.username} kullanıcısına davet gönderildi`, [], { type: 'success' });
        } catch (error: any) {
            alert('Hata', error.message || 'Davet gönderilemedi', [], { type: 'error' });
        } finally {
            setInviteLoading(null);
        }
    };

    const handleUpdateName = async () => {
        const name = newGroupName.trim();
        if (!name) {
            alert('Hata', 'Grup adı boş olamaz.', [], { type: 'error' });
            return;
        }
        try {
            await updateGroup(id, { name });
            setGroup((prev: any) => ({ ...prev, name }));
            closeSheet();
        } catch (error) {
            console.error(error);
            alert('Hata', 'Grup adı güncellenemedi.', [], { type: 'error' });
        }
    };

    const handleUpdatePrivacy = async (privacy: 'public' | 'private') => {
        try {
            await updateGroup(id, { privacy });
            setGroup((prev: any) => ({ ...prev, privacy }));
            closeSheet();
        } catch (error) {
            console.error(error);
            alert('Hata', 'Grup gizliliği güncellenemedi.', [], { type: 'error' });
        }
    };

    const handleDeleteGroup = () => {
        closeSheet();
        alert(
            'Grubu Sil',
            `"${group?.name}" grubunu silmek istediğine emin misin? Bu işlem geri alınamaz ve tüm maçlar da silinecek.`,
            [
                { text: 'İptal', style: 'cancel' },
                {
                    text: 'Sil',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await deleteGroup(id);
                            router.replace('/(tabs)/groups');
                        } catch (error) {
                            console.error(error);
                            alert('Hata', 'Grup silinemedi.', [], { type: 'error' });
                        }
                    },
                },
            ],
            { type: 'warning' }
        );
    };

    const handleLeaveGroup = () => {
        closeSheet();
        if (!user) return;
        if (group?.adminId === user.uid) {
            alert('Hata', 'Grup kurucusu gruptan ayrılamaz. Grubu silmen gerekir.', [], { type: 'error' });
            return;
        }
        alert(
            'Gruptan Ayrıl',
            `"${group?.name}" grubundan ayrılmak istediğine emin misin?`,
            [
                { text: 'İptal', style: 'cancel' },
                {
                    text: 'Ayrıl',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await removeFromGroup(id, user.uid);
                            router.replace('/(tabs)/groups');
                        } catch (error) {
                            console.error(error);
                            alert('Hata', 'Gruptan ayrılırken hata oluştu.', [], { type: 'error' });
                        }
                    },
                },
            ],
            { type: 'warning' }
        );
    };

    const handleToggleAdmin = () => {
        const member = selectedMember;
        if (!member || !user) return;
        const memberIsAdmin = admins.includes(member.uid);
        closeSheet();
        alert(
            memberIsAdmin ? 'Yöneticilikten Çıkar' : 'Yönetici Yap',
            memberIsAdmin
                ? `${member.displayName} kullanıcısının yönetici yetkisi kaldırılsın mı?`
                : `${member.displayName} kullanıcısı yönetici yapılsın mı?`,
            [
                { text: 'İptal', style: 'cancel' },
                {
                    text: memberIsAdmin ? 'Kaldır' : 'Yönetici Yap',
                    style: memberIsAdmin ? 'destructive' : 'default',
                    onPress: async () => {
                        try {
                            if (memberIsAdmin) await removeGroupAdmin(id, member.uid, user.uid);
                            else await addGroupAdmin(id, member.uid);
                            const updated: any = await getGroupDetails(id);
                            setGroup((prev: any) => ({ ...prev, admins: updated?.admins, adminId: updated?.adminId }));
                        } catch (error: any) {
                            alert('Hata', error.message || 'İşlem başarısız', [], { type: 'error' });
                        }
                    },
                },
            ]
        );
    };

    const handleRemoveMember = () => {
        const member = selectedMember;
        if (!member || !user) return;
        closeSheet();
        if (member.uid === group?.adminId) {
            alert('Hata', 'Grup kurucusu gruptan çıkarılamaz', [], { type: 'error' });
            return;
        }
        alert(
            'Üyeyi Çıkar',
            `${member.displayName || 'Bu üye'} gruptan çıkarılsın mı?`,
            [
                { text: 'İptal', style: 'cancel' },
                {
                    text: 'Çıkar',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await removeGroupMember(id, member.uid, user.uid);
                            setGroup((prev: any) => ({
                                ...prev,
                                members: prev.members.filter((m: string) => m !== member.uid),
                                memberDetails: prev.memberDetails.filter((m: any) => m.uid !== member.uid),
                            }));
                        } catch (error: any) {
                            alert('Hata', error.message || 'Üye çıkarılamadı', [], { type: 'error' });
                        }
                    },
                },
            ],
            { type: 'warning' }
        );
    };

    const goTo = (path: string) => {
        closeSheet();
        router.push(path as any);
    };

    /* ─────────────────────────── Derived ─────────────────────────── */

    const admins: string[] = group?.admins || (group?.adminId ? [group.adminId] : []);
    const isAdmin = !!user && !!group && (group.adminId === user.uid || admins.includes(user.uid));
    const isMember = !!user && !!group && (group.members || []).includes(user.uid);
    const memberDetails: any[] = group?.memberDetails || [];

    const isPast = (m: any) => m.status === 'FINISHED' || toDate(m.date).getTime() < now;
    const upcomingMatches = matches.filter(m => !isPast(m)).reverse();
    const pastMatches = matches.filter(isPast);
    const confirmedOf = (matchId: string) => (participantsMap[matchId] || []).filter((p: any) => p.status === 'IN');

    const withStats = memberDetails.map(m => ({ ...m, groupStats: groupStats[m.uid] || EMPTY_STATS }));
    const leaderBy = (key: keyof typeof EMPTY_STATS) =>
        withStats.filter(m => m.groupStats[key] > 0).sort((a, b) => b.groupStats[key] - a.groupStats[key])[0] || null;

    // Debts: unpaid, confirmed participation in paid matches.
    type DebtRow = { uid: string; name: string; photoURL?: string; owed: number; unpaid: { matchId: string; venue: string; date: Date; fee: number }[] };
    const debtRows = (() => {
        const rows = new Map<string, DebtRow>();
        let collected = 0;
        let remaining = 0;
        matches.forEach(m => {
            const fee = m.feePerPerson || 0;
            if (fee <= 0) return;
            confirmedOf(m.id).forEach((p: any) => {
                if (p.paid) {
                    collected += p.paidAmount !== undefined ? p.paidAmount : fee;
                    return;
                }
                remaining += fee;
                const profile = memberDetails.find(d => d.uid === p.userId);
                const row: DebtRow = rows.get(p.userId) ?? { uid: p.userId, name: profile?.displayName || p.name || 'İsimsiz', photoURL: profile?.photoURL, owed: 0, unpaid: [] };
                row.owed += fee;
                row.unpaid.push({ matchId: m.id, venue: m.venue || 'Maç', date: toDate(m.date), fee });
                rows.set(p.userId, row);
            });
        });
        return { list: [...rows.values()].sort((a, b) => b.owed - a.owed), collected, remaining };
    })();

    /* ─────────────────────────── Loading / not found ─────────────────────────── */

    const background = <LinearGradient colors={[C.gradient[0], C.gradient[1]]} style={StyleSheet.absoluteFill} />;
    const backButton = (
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} accessibilityLabel="Geri">
            <Ionicons name="chevron-back" size={24} color={C.text} />
        </TouchableOpacity>
    );

    if (loading || !group) {
        return (
            <View style={{ flex: 1, backgroundColor: C.background }}>
                {background}
                <View style={[st.header, { paddingTop: insets.top + 8 }]}>{backButton}</View>
                <View style={st.center}>
                    {loading
                        ? <ActivityIndicator size="large" color={C.primaryText} />
                        : <Text style={{ color: C.textSecondary }}>Grup bulunamadı</Text>}
                </View>
            </View>
        );
    }

    /* ─────────────────────────── Pieces ─────────────────────────── */

    const memberRow = (member: any, last: boolean) => {
        const memberIsAdmin = admins.includes(member.uid);
        const canManage = isAdmin && member.uid !== user?.uid && member.uid !== group.adminId;
        const position = POSITION_CODES[member.position];
        const detail = [member.overall ? `${Math.round(member.overall)} OVR` : null, position].filter(Boolean).join(' · ');
        return (
            <View key={member.uid} style={[st.memberRow, { borderBottomColor: C.divider }, last && st.noBorder]}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => goTo(`/user/${member.uid}?groupId=${id}`)} style={st.memberMain}>
                    <Avatar uri={member.photoURL} name={member.displayName} size={38} />
                    <Text style={[st.memberName, { color: C.text }]} numberOfLines={1}>{compactName(member.displayName)}</Text>
                    {memberIsAdmin
                        ? <Pill label={member.uid === group.adminId ? 'Kurucu' : 'Yönetici'} color={C.gold} />
                        : !!detail && <Text style={[st.memberRole, { color: C.textTertiary }]}>{detail}</Text>}
                </TouchableOpacity>
                {canManage && (
                    <TouchableOpacity onPress={() => { setSelectedMember(member); setSheet('member'); }} hitSlop={8} style={[st.iconBtn, { backgroundColor: C.iconTile }]}>
                        <Ionicons name="ellipsis-horizontal" size={16} color={C.text} />
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const requestsBanner = isAdmin && groupRequests.length > 0 && (
        <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setSheet('requests')}
            style={[st.banner, { backgroundColor: withOpacity(C.warning, 0.12), borderColor: withOpacity(C.warning, 0.35) }]}
        >
            <Ionicons name="person-add-outline" size={18} color={C.warning} />
            <Text style={[st.bannerText, { color: C.text }]}>{groupRequests.length} katılım isteği bekliyor</Text>
            <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
        </TouchableOpacity>
    );

    const sectionHead = (title: string, action?: { label: string; onPress: () => void }) => (
        <View style={st.sectionHead}>
            <Eyebrow>{title}</Eyebrow>
            {action && (
                <TouchableOpacity onPress={action.onPress} hitSlop={8}>
                    <Text style={[st.link, { color: C.link }]}>{action.label}</Text>
                </TouchableOpacity>
            )}
        </View>
    );

    const renderGenel = () => {
        const next = upcomingMatches[0];
        const leaders = [
            { key: 'goals' as const, label: 'Gol Kralı', icon: 'football-outline' as const },
            { key: 'assists' as const, label: 'Asist Kralı', icon: 'git-branch-outline' as const },
            { key: 'motmCount' as const, label: 'MVP', icon: 'trophy-outline' as const },
        ];
        return (
            <View style={{ gap: 14 }}>
                {requestsBanner}

                {next ? (
                    <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => router.push(`/match/${next.id}`)}
                        style={[st.card, { backgroundColor: C.card, borderColor: C.link }]}
                    >
                        <View style={st.cardHead}>
                            <Eyebrow>Sıradaki Maç</Eyebrow>
                            <Pill label={`${confirmedOf(next.id).length}/${next.maxPlayers || 14} Oyuncu`} color={C.link} />
                        </View>
                        <Text style={[st.nextVenue, { color: C.text }]} numberOfLines={1}>{next.venue || 'Maç'}</Text>
                        <Text style={[st.nextSub, { color: C.textSecondary }]}>
                            {matchWhen(toDate(next.date))}{next.feePerPerson > 0 ? ` · ${formatTL(next.feePerPerson)} / kişi` : ''}
                        </Text>
                    </TouchableOpacity>
                ) : (
                    <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                        <Eyebrow>Sıradaki Maç</Eyebrow>
                        <Text style={[st.nextSub, { color: C.textSecondary, marginTop: 8 }]}>Planlanmış bir maç yok.</Text>
                        {isAdmin && (
                            <PrimaryButton label="Maç Oluştur" icon="add" onPress={() => router.push(`/create-match?groupId=${id}`)} style={{ marginTop: 14, height: 44 }} />
                        )}
                    </View>
                )}

                {upcomingMatches.length > 1 && (
                    <View>
                        {sectionHead('Diğer Yaklaşan Maçlar')}
                        {upcomingMatches.slice(1, 4).map((m, i, arr) => (
                            <MatchRow
                                key={m.id}
                                title={m.venue || 'Maç'}
                                sub={matchWhen(toDate(m.date))}
                                right={<Pill label={`${confirmedOf(m.id).length}/${m.maxPlayers || 14}`} />}
                                last={i === arr.length - 1}
                                onPress={() => router.push(`/match/${m.id}`)}
                            />
                        ))}
                    </View>
                )}

                <View style={st.leaderRow}>
                    {leaders.map(l => {
                        const leader = leaderBy(l.key);
                        return (
                            <TouchableOpacity
                                key={l.key}
                                activeOpacity={0.8}
                                onPress={() => setTab('istatistik')}
                                style={[st.leaderBox, { backgroundColor: C.card, borderColor: C.border }]}
                            >
                                <Ionicons name={l.icon} size={18} color={l.key === 'motmCount' ? C.gold : C.link} />
                                <Text style={[st.leaderNum, { color: C.text }]}>{leader ? leader.groupStats[l.key] : '—'}</Text>
                                <Text style={[st.leaderLbl, { color: C.textSecondary }]} numberOfLines={1}>
                                    {leader ? compactName(leader.displayName) : l.label}
                                </Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                <View>
                    {sectionHead('Grup İstatistikleri')}
                    {tier !== 'captain' ? (
                        <View style={[st.card, st.lockedCard, { backgroundColor: C.card, borderColor: C.border }]}>
                            <Ionicons name="lock-closed-outline" size={22} color={C.gold} />
                            <Text style={[st.nextSub, { color: C.textSecondary, textAlign: 'center' }]}>
                                Maç sıklığı, katılım oranı ve skor analizleri Kaptan Pro özelliğidir.
                            </Text>
                            <PrimaryButton label="Kaptan Pro'ya Geç" onPress={() => router.push('/settings/premium')} style={{ height: 40, alignSelf: 'stretch', marginTop: 4 }} />
                        </View>
                    ) : pastMatches.some(m => m.status === 'FINISHED') ? (
                        <GroupAnalytics
                            data={calculateGroupAnalytics(
                                matches.map(m => ({ ...m, participants: participantsMap[m.id] || [] })),
                                withStats
                            )}
                        />
                    ) : (
                        <Text style={[st.muted, { color: C.textTertiary }]}>İstatistikler için tamamlanmış en az bir maç gerekiyor.</Text>
                    )}
                </View>
            </View>
        );
    };

    const renderRanking = (title: string, icon: keyof typeof Ionicons.glyphMap, key: keyof typeof EMPTY_STATS, opts: { onlyPositive?: boolean; showRate?: boolean } = {}) => {
        const ranking = [...withStats]
            .filter(m => !opts.onlyPositive || m.groupStats[key] > 0)
            .sort((a, b) => b.groupStats[key] - a.groupStats[key]);
        if (opts.onlyPositive && ranking.length === 0) return null;
        const expanded = !!expandedRankings[key];
        const shown = ranking.slice(0, canSeeAllRankings && expanded ? ranking.length : 3);
        return (
            <View key={key} style={{ marginBottom: 20 }}>
                <View style={st.sectionHead}>
                    <View style={st.rowCenter}>
                        <Ionicons name={icon} size={16} color={C.link} />
                        <Text style={[st.rankTitle, { color: C.text }]}>{title}</Text>
                    </View>
                    {ranking.length > 3 && (
                        <TouchableOpacity
                            hitSlop={8}
                            onPress={() => (canSeeAllRankings ? setExpandedRankings(prev => ({ ...prev, [key]: !expanded })) : router.push('/settings/premium'))}
                        >
                            <Text style={[st.link, { color: canSeeAllRankings ? C.link : C.gold }]}>
                                {canSeeAllRankings && expanded ? 'Daralt' : `Tümünü Gör (${ranking.length})`}
                            </Text>
                        </TouchableOpacity>
                    )}
                </View>
                {ranking.length === 0 ? (
                    <Text style={[st.muted, { color: C.textTertiary }]}>Henüz veri yok</Text>
                ) : shown.map((m, index) => {
                    const locked = !canSeeAllRankings && index >= visibleRankingCount;
                    const value = m.groupStats[key];
                    const rate = m.groupStats.matchesPlayed > 0 ? Math.round((m.groupStats.wins / m.groupStats.matchesPlayed) * 100) : 0;
                    return (
                        <TouchableOpacity
                            key={m.uid}
                            activeOpacity={0.7}
                            onPress={() => router.push(locked ? '/settings/premium' : (`/user/${m.uid}?groupId=${id}` as any))}
                            style={[st.rankRow, { borderBottomColor: C.divider }, index === shown.length - 1 && st.noBorder]}
                        >
                            <View style={[st.rankBadge, { backgroundColor: index === 0 ? withOpacity(C.gold, 0.2) : C.iconTile }]}>
                                <Text style={[st.rankNum, { color: index === 0 ? C.gold : C.textSecondary }]}>{index + 1}</Text>
                            </View>
                            <Avatar uri={locked ? undefined : m.photoURL} name={locked ? '?' : m.displayName} size={34} />
                            <Text style={[st.memberName, { color: locked ? C.textTertiary : C.text }]} numberOfLines={1}>
                                {locked ? 'Pro ile görüntüle' : m.displayName || 'İsimsiz'}
                            </Text>
                            {locked ? (
                                <Ionicons name="lock-closed" size={15} color={C.gold} />
                            ) : (
                                <View style={{ alignItems: 'flex-end' }}>
                                    <Text style={[st.rankValue, { color: C.link }]}>{value}</Text>
                                    {opts.showRate && <Text style={[st.rankRate, { color: C.textTertiary }]}>%{rate}</Text>}
                                </View>
                            )}
                        </TouchableOpacity>
                    );
                })}
            </View>
        );
    };

    const renderIstatistik = () => (
        <View>
            {renderRanking('Gol Kralı', 'football-outline', 'goals')}
            {renderRanking('Asist Kralı', 'git-branch-outline', 'assists')}
            {renderRanking('MVP', 'trophy-outline', 'motmCount')}
            {renderRanking('En Çok Kazanan', 'ribbon-outline', 'wins', { showRate: true })}
            {renderRanking('Gol Yemeden Bitirme', 'shield-checkmark-outline', 'cleanSheets', { onlyPositive: true })}
        </View>
    );

    // Admin-only tab; members see their own debts on the Borçlarım screen.
    const renderBorclar = () => (
        <View style={{ gap: 14 }}>
            <View style={st.finRow}>
                <FinBox label="Toplanan" value={formatTL(debtRows.collected)} color={C.link} />
                <FinBox label="Kalan Borç" value={formatTL(debtRows.remaining)} color={debtRows.remaining > 0 ? C.error : C.text} />
            </View>
            <View>
                {sectionHead('Borçlu Oyuncular')}
                {debtRows.list.length === 0 ? (
                    <Text style={[st.muted, { color: C.textTertiary }]}>Bekleyen ödeme yok.</Text>
                ) : debtRows.list.slice(0, 5).map((row, i, arr) => (
                    <View key={row.uid} style={[st.memberRow, { borderBottomColor: C.divider }, i === arr.length - 1 && st.noBorder]}>
                        <Avatar uri={row.photoURL} name={row.name} size={38} />
                        <View style={{ flex: 1 }}>
                            <Text style={[st.memberName, { color: C.text }]} numberOfLines={1}>{compactName(row.name)}</Text>
                            <Text style={[st.memberRole, { color: C.textSecondary }]}>{row.unpaid.length} maçtan borç</Text>
                        </View>
                        <Text style={[st.debtAmount, { color: C.error }]}>{formatTL(row.owed)}</Text>
                    </View>
                ))}
            </View>
            <SecondaryButton label="Grup Kasasını Aç" icon="wallet-outline" onPress={() => router.push(`/group/${id}/group-debts`)} />
        </View>
    );

    const renderGecmis = () => (
        pastMatches.length === 0 ? (
            <Text style={[st.muted, { color: C.textTertiary, textAlign: 'center', paddingVertical: 32 }]}>Henüz oynanmış maç yok.</Text>
        ) : (
            <View>
                {pastMatches.map((m, i) => {
                    const hasScore = m.scoreA !== undefined && m.scoreB !== undefined;
                    return (
                        <MatchRow
                            key={m.id}
                            title={m.venue || 'Maç'}
                            sub={format(toDate(m.date), 'd MMMM yyyy · HH:mm', { locale: tr })}
                            right={<Pill label={hasScore ? `${m.scoreA} - ${m.scoreB}` : 'Skor yok'} color={hasScore ? C.link : undefined} />}
                            last={i === pastMatches.length - 1}
                            onPress={() => router.push(`/match/${m.id}`)}
                        />
                    );
                })}
            </View>
        )
    );

    const tabs: { key: Tab; label: string; badge?: number }[] = [
        { key: 'genel', label: 'Genel' },
        { key: 'istatistik', label: 'İstatistik' },
        ...(isAdmin ? [{ key: 'borclar' as const, label: 'Borçlar' }] : []),
        { key: 'gecmis', label: 'Geçmiş' },
    ];

    /* ─────────────────────────── Render ─────────────────────────── */

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            {background}

            <View style={[st.header, { paddingTop: insets.top + 8 }]}>
                {backButton}
                <TouchableOpacity
                    onPress={() => setSheet('more')}
                    style={[st.roundBtn, { backgroundColor: C.card, borderColor: C.border }]}
                    accessibilityLabel="Diğer seçenekler"
                >
                    <Ionicons name="ellipsis-horizontal" size={20} color={C.text} />
                </TouchableOpacity>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
                showsVerticalScrollIndicator={false}
                refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadGroup(); }} tintColor={C.primaryText} />}
            >
                {/* Cover */}
                <View style={st.cover}>
                    <View style={st.stripes}>
                        {Array.from({ length: 10 }).map((_, i) => (
                            <View key={i} style={{ flex: 1, backgroundColor: i % 2 ? withOpacity(palette.greenBright, 0.12) : palette.transparent }} />
                        ))}
                    </View>
                    <LinearGradient colors={[palette.transparent, withOpacity(C.gradient[0], 0.9)]} start={{ x: 0, y: 0.4 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
                    <TouchableOpacity
                        activeOpacity={0.85}
                        disabled={!isAdmin || uploadingPhoto}
                        onPress={() => (group.photoURL ? setSheet('photo') : pickImage())}
                        style={[st.groupAvatar, { borderColor: C.gradient[0], backgroundColor: C.avatar }]}
                    >
                        {uploadingPhoto
                            ? <ActivityIndicator color={C.primaryText} />
                            : <Avatar uri={group.photoURL} name={group.name} size={64} radius={16} />}
                        {isAdmin && (
                            <View style={[st.cameraBadge, { backgroundColor: C.primary, borderColor: C.gradient[0] }]}>
                                <Ionicons name="camera" size={12} color={C.onPrimary} />
                            </View>
                        )}
                    </TouchableOpacity>
                </View>

                <Text style={[st.groupName, { color: C.text }]} numberOfLines={2}>{group.name}</Text>
                <View style={st.metaRow}>
                    <TouchableOpacity onPress={() => setSheet('members')} hitSlop={8} activeOpacity={0.6} style={st.rowCenter} accessibilityLabel="Üye listesini aç">
                        <Ionicons name="people" size={14} color={C.link} />
                        <Text style={[st.groupMeta, st.metaLink, { color: C.link }]}>{(group.members || []).length} üye</Text>
                    </TouchableOpacity>
                    <Text style={[st.groupMeta, { color: C.textSecondary }]}>
                        {' · '}{matches.length} maç · {group.privacy === 'private' ? 'Onaylı katılım' : 'Herkese açık'}
                    </Text>
                </View>

                <View style={st.actions}>
                    {!isMember ? (
                        joinRequestStatus === 'pending' ? (
                            <SecondaryButton label="İstek Gönderildi" icon="time-outline" color={C.textSecondary} disabled onPress={() => {}} style={{ flex: 1 }} />
                        ) : (
                            <PrimaryButton
                                label={group.privacy === 'private' ? 'Katılım İsteği Gönder' : 'Gruba Katıl'}
                                icon="person-add-outline"
                                onPress={handleJoinGroup}
                                disabled={joiningGroup}
                                loading={joiningGroup ? <ActivityIndicator color={C.onPrimary} /> : undefined}
                                style={{ flex: 1 }}
                            />
                        )
                    ) : (
                        <>
                            {/* Visible to every member, usable only by admins. */}
                            <PrimaryButton
                                label="Grubu Yönet"
                                icon={isAdmin ? undefined : 'lock-closed'}
                                onPress={() => setSheet('manage')}
                                disabled={!isAdmin}
                                style={{ flex: 1 }}
                            />
                            <SecondaryButton label="Davet Et" onPress={openInvite} style={{ flex: 1 }} />
                        </>
                    )}
                </View>

                <TabStrip<Tab> tabs={tabs} active={tab} onChange={setTab} progress={tabProgress} />

                {/* Full-bleed pager so neighbouring tabs slide in from the screen edge. */}
                <SwipePager
                    autoHeight
                    index={Math.max(0, tabs.findIndex(t => t.key === tab))}
                    onIndexChange={i => tabs[i] && setTab(tabs[i].key)}
                    progress={tabProgress}
                    style={{ marginHorizontal: -16 }}
                    pages={tabs.map(t => (
                        <View key={t.key} style={{ paddingHorizontal: 16 }}>
                            {t.key === 'genel' ? renderGenel()
                                : t.key === 'istatistik' ? renderIstatistik()
                                    : t.key === 'borclar' ? renderBorclar()
                                        : renderGecmis()}
                        </View>
                    ))}
                />
            </ScrollView>

            {/* Admin management */}
            <Sheet visible={sheet === 'manage'} onClose={closeSheet} title="Grubu Yönet">
                <ScrollView showsVerticalScrollIndicator={false}>
                    <SheetRow icon="add-circle-outline" label="Maç Oluştur" onPress={() => goTo(`/create-match?groupId=${id}`)} />
                    <SheetRow
                        icon="person-add-outline"
                        label="Katılım İstekleri"
                        onPress={() => setSheet('requests')}
                        right={groupRequests.length > 0 ? <Pill label={String(groupRequests.length)} color={C.warning} /> : undefined}
                    />
                    <SheetRow icon="wallet-outline" label="Grup Kasası" sub="Borç ve ödeme kayıtları" onPress={() => goTo(`/group/${id}/group-debts`)} />
                    <SheetRow icon="speedometer-outline" label="Oyuncu Güçleri" sub="Mevki ve güç ayarları" onPress={() => goTo(`/group/${id}/player-setup`)} />
                    <SheetRow icon="create-outline" label="Grup Adını Düzenle" onPress={() => { setNewGroupName(group.name || ''); setSheet('rename'); }} />
                    <SheetRow icon="image-outline" label="Grup Fotoğrafı" onPress={() => (group.photoURL ? setSheet('photo') : pickImage())} />
                    <SheetRow
                        icon="lock-closed-outline"
                        label="Gizlilik"
                        last
                        onPress={() => setSheet('privacy')}
                        right={<Text style={[st.sheetValue, { color: C.textSecondary }]}>{group.privacy === 'private' ? 'Onaylı' : 'Açık'}</Text>}
                    />
                </ScrollView>
            </Sheet>

            {/* More (everyone) */}
            <Sheet visible={sheet === 'more'} onClose={closeSheet}>
                <SheetRow icon="share-social-outline" label="Grup Linkini Paylaş" onPress={shareGroupLink} />
                {isMember && !isAdmin && (
                    <SheetRow icon="speedometer-outline" label="Oyuncu Güçleri" onPress={() => goTo(`/group/${id}/player-setup`)} />
                )}
                {isAdmin && group.adminId === user?.uid ? (
                    <SheetRow icon="trash-outline" label="Grubu Sil" danger last onPress={handleDeleteGroup} />
                ) : isMember ? (
                    <SheetRow icon="exit-outline" label="Gruptan Ayrıl" danger last onPress={handleLeaveGroup} />
                ) : null}
            </Sheet>

            {/* Member list (opened from "N üye") */}
            <Sheet visible={sheet === 'members'} onClose={closeSheet} title={`Üyeler (${memberDetails.length})`}>
                {isAdmin && groupRequests.length > 0 && (
                    <SheetRow
                        icon="person-add-outline"
                        label="Katılım İstekleri"
                        onPress={() => setSheet('requests')}
                        right={<Pill label={String(groupRequests.length)} color={C.warning} />}
                    />
                )}
                <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
                    {memberDetails.map((m, i) => memberRow(m, i === memberDetails.length - 1))}
                </ScrollView>
                {isMember && <SecondaryButton label="Davet Et" icon="person-add-outline" onPress={openInvite} style={{ marginTop: 12 }} />}
            </Sheet>

            {/* Member actions — closing returns to the member list */}
            <Sheet visible={sheet === 'member'} onClose={() => setSheet('members')} title={selectedMember?.displayName || 'Üye'}>
                <SheetRow icon="person-outline" label="Profili Görüntüle" onPress={() => goTo(`/user/${selectedMember?.uid}?groupId=${id}`)} />
                <SheetRow
                    icon={selectedMember && admins.includes(selectedMember.uid) ? 'remove-circle-outline' : 'shield-checkmark-outline'}
                    label={selectedMember && admins.includes(selectedMember.uid) ? 'Yöneticilikten Çıkar' : 'Yönetici Yap'}
                    onPress={handleToggleAdmin}
                />
                <SheetRow icon="person-remove-outline" label="Gruptan Çıkar" danger last onPress={handleRemoveMember} />
            </Sheet>

            {/* Invite */}
            <Sheet visible={sheet === 'invite'} onClose={closeSheet} title="Gruba Davet Et">
                <View style={st.searchRow}>
                    <TextInput
                        value={searchQuery}
                        onChangeText={setSearchQuery}
                        onSubmitEditing={handleSearchUsers}
                        placeholder="Kullanıcı adı veya e-posta"
                        placeholderTextColor={C.placeholder}
                        autoCapitalize="none"
                        returnKeyType="search"
                        style={[st.input, { flex: 1, backgroundColor: C.input, borderColor: C.border, color: C.text }]}
                    />
                    <TouchableOpacity onPress={handleSearchUsers} disabled={searchLoading} style={[st.searchBtn, { backgroundColor: C.primary }]}>
                        {searchLoading ? <ActivityIndicator size="small" color={C.onPrimary} /> : <Ionicons name="search" size={20} color={C.onPrimary} />}
                    </TouchableOpacity>
                </View>
                <ScrollView style={{ maxHeight: 280 }} keyboardShouldPersistTaps="handled">
                    {searchResults.map((result, i) => (
                        <View key={result.uid} style={[st.memberRow, { borderBottomColor: C.divider }, i === searchResults.length - 1 && st.noBorder]}>
                            <Avatar uri={result.photoURL} name={result.displayName || result.username} size={38} />
                            <View style={{ flex: 1 }}>
                                <Text style={[st.memberName, { color: C.text }]} numberOfLines={1}>{result.displayName || result.username}</Text>
                                {!!result.username && <Text style={[st.memberRole, { color: C.textSecondary }]}>@{result.username}</Text>}
                            </View>
                            <TouchableOpacity
                                onPress={() => handleSendGroupInvite(result)}
                                disabled={inviteLoading === result.uid}
                                style={[st.smallBtn, { backgroundColor: C.primary }, inviteLoading === result.uid && st.dimmed]}
                            >
                                {inviteLoading === result.uid
                                    ? <ActivityIndicator size="small" color={C.onPrimary} />
                                    : <Text style={[st.smallBtnText, { color: C.onPrimary }]}>Davet Et</Text>}
                            </TouchableOpacity>
                        </View>
                    ))}
                    {searched && !searchLoading && searchResults.length === 0 && (
                        <Text style={[st.muted, { color: C.textTertiary, textAlign: 'center', paddingVertical: 20 }]}>Kullanıcı bulunamadı</Text>
                    )}
                </ScrollView>
                <SecondaryButton label="Davet Linki Paylaş" icon="link-outline" onPress={shareGroupLink} style={{ marginTop: 12 }} />
            </Sheet>

            {/* Join requests */}
            <Sheet visible={sheet === 'requests'} onClose={closeSheet} title="Katılım İstekleri">
                <ScrollView style={{ maxHeight: 360 }}>
                    {groupRequests.length === 0 ? (
                        <Text style={[st.muted, { color: C.textTertiary, textAlign: 'center', paddingVertical: 20 }]}>Bekleyen istek yok.</Text>
                    ) : groupRequests.map((req, i) => (
                        <View key={req.id} style={[st.memberRow, { borderBottomColor: C.divider }, i === groupRequests.length - 1 && st.noBorder]}>
                            <Avatar uri={req.user?.photoURL} name={req.user?.displayName} size={38} />
                            <View style={{ flex: 1 }}>
                                <Text style={[st.memberName, { color: C.text }]} numberOfLines={1}>{req.user?.displayName || 'Kullanıcı'}</Text>
                                {!!req.user?.username && <Text style={[st.memberRole, { color: C.textSecondary }]}>@{req.user.username}</Text>}
                            </View>
                            <TouchableOpacity onPress={() => handleRespondRequest(req.id, req.uid, 'reject')} style={[st.roundSmall, { backgroundColor: withOpacity(C.error, 0.14) }]}>
                                <Ionicons name="close" size={18} color={C.error} />
                            </TouchableOpacity>
                            <TouchableOpacity onPress={() => handleRespondRequest(req.id, req.uid, 'approve')} style={[st.roundSmall, { backgroundColor: C.primary }]}>
                                <Ionicons name="checkmark" size={18} color={C.onPrimary} />
                            </TouchableOpacity>
                        </View>
                    ))}
                </ScrollView>
            </Sheet>

            {/* Privacy */}
            <Sheet visible={sheet === 'privacy'} onClose={closeSheet} title="Grup Gizliliği">
                <View style={{ gap: 10, paddingTop: 4 }}>
                    {([
                        { value: 'public', title: 'Herkese Açık', sub: 'Herkes grubu görebilir ve direkt katılabilir' },
                        { value: 'private', title: 'Onaylı Katılım', sub: 'Sadece yönetici onayı ile üye kabul edilir' },
                    ] as const).map(opt => {
                        const selected = (group.privacy || 'public') === opt.value;
                        return (
                            <TouchableOpacity
                                key={opt.value}
                                activeOpacity={0.8}
                                onPress={() => handleUpdatePrivacy(opt.value)}
                                style={[st.option, { backgroundColor: C.card, borderColor: selected ? C.link : C.border }]}
                            >
                                <View style={[st.radio, { borderColor: selected ? C.link : C.textTertiary }]}>
                                    {selected && <View style={[st.radioDot, { backgroundColor: C.link }]} />}
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[st.memberName, { color: C.text }]}>{opt.title}</Text>
                                    <Text style={[st.memberRole, { color: C.textSecondary, marginTop: 2 }]}>{opt.sub}</Text>
                                </View>
                            </TouchableOpacity>
                        );
                    })}
                </View>
            </Sheet>

            {/* Rename */}
            <Sheet visible={sheet === 'rename'} onClose={closeSheet} title="Grup Adını Düzenle">
                <TextInput
                    value={newGroupName}
                    onChangeText={setNewGroupName}
                    placeholder="Grup adı"
                    placeholderTextColor={C.placeholder}
                    maxLength={40}
                    autoFocus
                    style={[st.input, { backgroundColor: C.input, borderColor: C.border, color: C.text, marginTop: 4 }]}
                />
                <PrimaryButton label="Kaydet" onPress={handleUpdateName} disabled={!newGroupName.trim()} style={{ marginTop: 12 }} />
            </Sheet>

            {/* Photo */}
            <Sheet visible={sheet === 'photo'} onClose={closeSheet} title="Grup Fotoğrafı">
                <SheetRow icon="images-outline" label="Galeriden Seç" onPress={pickImage} />
                <SheetRow icon="trash-outline" label="Fotoğrafı Kaldır" danger last onPress={removePhoto} />
            </Sheet>
        </View>
    );
}

function MatchRow({ title, sub, right, last, onPress }: { title: string; sub: string; right?: ReactNode; last?: boolean; onPress: () => void }) {
    const C = useSettingsColors();
    return (
        <TouchableOpacity activeOpacity={0.7} onPress={onPress} style={[st.memberRow, { borderBottomColor: C.divider }, last && st.noBorder]}>
            <View style={[st.matchIcon, { backgroundColor: withOpacity(C.accent, 0.12) }]}>
                <Ionicons name="football" size={18} color={C.link} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[st.memberName, { color: C.text }]} numberOfLines={1}>{title}</Text>
                <Text style={[st.memberRole, { color: C.textSecondary, marginTop: 2 }]} numberOfLines={1}>{sub}</Text>
            </View>
            {right}
        </TouchableOpacity>
    );
}

const st = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    noBorder: { borderBottomWidth: 0 },
    dimmed: { opacity: 0.5 },

    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 12 },
    roundBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

    cover: { height: 110, borderRadius: 20, marginBottom: 44, backgroundColor: palette.darkGreen },
    stripes: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, flexDirection: 'row', borderRadius: 20, overflow: 'hidden' },
    groupAvatar: { position: 'absolute', left: 16, bottom: -30, width: 72, height: 72, borderRadius: 20, borderWidth: 4, alignItems: 'center', justifyContent: 'center' },
    cameraBadge: { position: 'absolute', right: -6, bottom: -6, width: 24, height: 24, borderRadius: 12, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },

    groupName: { fontSize: 20, fontWeight: '800' },
    metaRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', marginTop: 2 },
    groupMeta: { fontSize: 12.5, fontWeight: '600' },
    metaLink: { fontWeight: '700', textDecorationLine: 'underline' },
    actions: { flexDirection: 'row', gap: 10, marginTop: 14, marginBottom: 18 },

    banner: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, borderWidth: 1 },
    bannerText: { flex: 1, fontSize: 13.5, fontWeight: '600' },

    card: { borderRadius: 20, borderWidth: 1, padding: 18 },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
    nextVenue: { fontSize: 16, fontWeight: '800' },
    nextSub: { fontSize: 12.5, fontWeight: '600', marginTop: 2 },
    lockedCard: { alignItems: 'center', gap: 8 },

    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    link: { fontSize: 12, fontWeight: '700' },
    muted: { fontSize: 13, fontWeight: '500' },

    leaderRow: { flexDirection: 'row', gap: 10 },
    leaderBox: { flex: 1, borderRadius: 16, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', gap: 2 },
    leaderNum: { fontSize: 18, fontWeight: '800', marginTop: 2 },
    leaderLbl: { fontSize: 10.5, fontWeight: '600' },

    memberRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    memberMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
    memberName: { flex: 1, fontSize: 14.5, fontWeight: '700' },
    memberRole: { fontSize: 11.5, fontWeight: '600' },
    iconBtn: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    matchIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    debtAmount: { fontSize: 14.5, fontWeight: '800' },
    finRow: { flexDirection: 'row', gap: 10 },

    rankTitle: { fontSize: 15, fontWeight: '800' },
    rankRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth },
    rankBadge: { width: 26, height: 26, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
    rankNum: { fontSize: 12, fontWeight: '800' },
    rankValue: { fontSize: 16, fontWeight: '800' },
    rankRate: { fontSize: 10, fontWeight: '600' },

    sheetValue: { fontSize: 13, fontWeight: '600' },
    searchRow: { flexDirection: 'row', gap: 8, marginTop: 4, marginBottom: 8 },
    input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
    searchBtn: { width: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
    smallBtn: { paddingHorizontal: 12, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    smallBtnText: { fontSize: 12.5, fontWeight: '700' },
    roundSmall: { width: 34, height: 34, borderRadius: 17, alignItems: 'center', justifyContent: 'center' },

    option: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5 },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    radioDot: { width: 10, height: 10, borderRadius: 5 },
});
