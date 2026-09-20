import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Avatar, Pill, toDate } from '../../components/group/GroupUI';
import { useSettingsColors } from '../../components/settings/SettingsUI';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import { withOpacity } from '../../constants/designTokens';
import { useAuth } from '../../context/AuthContext';
import { usePremium } from '../../context/PremiumContext';
import { getGroupMatches, getUserGroups, getUserProfile } from '../../services/firestore';

/** Layout: design/tasarım/macvar-additional-screens.html (Gruplarım); colors from designTokens. */

const TAB_BAR_HEIGHT = 68; // keep in sync with app/(tabs)/_layout.tsx
const PREVIEW_MEMBERS = 3;
const STALE_DAYS = 30;

interface GroupSummary {
    id: string;
    name: string;
    photoURL?: string;
    memberCount: number;
    isAdmin: boolean;
    preview: { uid: string; displayName?: string; photoURL?: string }[];
    matchCount: number;
    hasUpcoming: boolean;
    lastMatchAt: Date | null;
    stale: boolean;
}

export default function GroupsScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { canCreateGroup, tier } = usePremium();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    const [groups, setGroups] = useState<GroupSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchGroups = async () => {
        if (!user) return;
        try {
            const raw: any[] = await getUserGroups(user.uid);
            const now = Date.now();
            const summaries = await Promise.all(raw.map(async (g): Promise<GroupSummary> => {
                const members: string[] = g.members || [];
                const [matches, ...profiles] = await Promise.all([
                    getGroupMatches(g.id).catch(() => [] as any[]),
                    ...members.slice(0, PREVIEW_MEMBERS).map(uid => getUserProfile(uid).catch(() => null)),
                ]);
                const times = (matches as any[]).map(m => ({ t: toDate(m.date).getTime(), finished: m.status === 'FINISHED' }));
                const past = times.filter(m => m.finished || m.t < now).map(m => m.t);
                const hasUpcoming = times.some(m => !m.finished && m.t >= now);
                const lastMatchAt = past.length ? new Date(Math.max(...past)) : null;
                return {
                    id: g.id,
                    name: g.name || 'Grup',
                    photoURL: g.photoURL,
                    memberCount: members.length,
                    isAdmin: g.adminId === user.uid || (g.admins || []).includes(user.uid),
                    preview: members.slice(0, PREVIEW_MEMBERS).map((uid, i) => ({ uid, ...(profiles[i] as any) })),
                    matchCount: times.length,
                    hasUpcoming,
                    lastMatchAt,
                    // Played before, but nothing for a month: dimmed like the design's inactive group.
                    stale: !hasUpcoming && !!lastMatchAt && now - lastMatchAt.getTime() > STALE_DAYS * 86400000,
                };
            }));
            // Groups with a match coming up first, then by most recent activity.
            summaries.sort((a, b) =>
                Number(b.hasUpcoming) - Number(a.hasUpcoming) ||
                (b.lastMatchAt?.getTime() ?? 0) - (a.lastMatchAt?.getTime() ?? 0)
            );
            setGroups(summaries);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchGroups();
        }, [user])
    );

    const tabBarTop = (insets.bottom > 0 ? insets.bottom + 8 : 16) + TAB_BAR_HEIGHT;
    const planName = tier === 'player' ? 'Oyuncu Pro planında' : 'Ücretsiz planda';
    const maxGroups = tier === 'player' ? 3 : 1;

    const renderGroup = ({ item }: { item: GroupSummary }) => {
        const extra = item.memberCount - item.preview.length;
        return (
            <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => router.push(`/group/${item.id}`)}
                style={[
                    st.card,
                    { backgroundColor: C.card, borderColor: item.hasUpcoming ? C.link : C.border },
                    item.stale && st.stale,
                ]}
            >
                <View style={st.cardTop}>
                    <Avatar uri={item.photoURL} name={item.name} size={44} radius={14} />
                    <View style={{ flex: 1 }}>
                        <Text style={[st.name, { color: C.text }]} numberOfLines={1}>{item.name}</Text>
                        <Text style={[st.meta, { color: C.textSecondary }]} numberOfLines={1}>
                            {item.memberCount} üye · {item.matchCount} maç
                        </Text>
                    </View>
                    <View style={[st.role, { backgroundColor: item.isAdmin ? withOpacity(C.link, 0.15) : C.iconTile }]}>
                        <Text style={[st.roleText, { color: item.isAdmin ? C.link : C.textSecondary }]}>
                            {item.isAdmin ? 'YÖNETİCİ' : 'ÜYE'}
                        </Text>
                    </View>
                </View>

                <View style={st.cardFoot}>
                    <View style={st.stack}>
                        {item.preview.map((m, i) => (
                            <View key={m.uid} style={i > 0 && st.stacked}>
                                <Avatar uri={m.photoURL} name={m.displayName} size={32} ring={C.sheet} />
                            </View>
                        ))}
                        {extra > 0 && (
                            <View style={st.stacked}>
                                <View style={[st.more, { backgroundColor: C.segment, borderColor: C.sheet }]}>
                                    <Text style={[st.moreText, { color: C.textSecondary }]}>+{extra}</Text>
                                </View>
                            </View>
                        )}
                    </View>
                    {item.hasUpcoming ? (
                        <Pill label="Aktif maç var" color={C.link} icon="ellipse" />
                    ) : (
                        <Pill label={item.lastMatchAt ? `Son maç: ${formatDistanceToNow(item.lastMatchAt, { addSuffix: true, locale: tr })}` : 'Henüz maç yok'} />
                    )}
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <LinearGradient colors={[C.gradient[0], C.gradient[1]]} style={StyleSheet.absoluteFill} />

            <View style={[st.header, { paddingTop: insets.top + 8 }]}>
                <Text style={[st.title, { color: C.text }]}>Gruplarım</Text>
                <View style={st.headerActions}>
                    <TouchableOpacity
                        onPress={() => router.push('/notifications')}
                        style={[st.roundBtn, { backgroundColor: C.card, borderColor: C.border }]}
                        accessibilityLabel="Bildirimler"
                    >
                        <Ionicons name="notifications-outline" size={20} color={C.text} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => router.push('/create-group')}
                        style={[st.roundBtn, { backgroundColor: C.primary, borderColor: C.primary }]}
                        accessibilityLabel="Yeni grup oluştur"
                    >
                        <Ionicons name="add" size={24} color={C.onPrimary} />
                    </TouchableOpacity>
                </View>
            </View>

            {loading ? (
                <View style={{ paddingHorizontal: 16, gap: 14 }}>
                    {[0, 1, 2].map(i => <SkeletonLoader key={i} height={128} borderRadius={20} />)}
                </View>
            ) : (
                <FlatList
                    data={groups}
                    keyExtractor={item => item.id}
                    renderItem={renderGroup}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: tabBarTop + 16, gap: 14, flexGrow: 1 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchGroups(); }} tintColor={C.primaryText} />}
                    ListEmptyComponent={
                        <View style={st.empty}>
                            <View style={[st.emptyIcon, { backgroundColor: C.iconTile }]}>
                                <Ionicons name="people-outline" size={30} color={C.textSecondary} />
                            </View>
                            <Text style={[st.emptyTitle, { color: C.text }]}>Henüz grubun yok</Text>
                            <Text style={[st.emptyText, { color: C.textSecondary }]}>
                                Arkadaşlarınla bir grup kur, maçları birlikte organize et.
                            </Text>
                        </View>
                    }
                    ListFooterComponent={
                        groups.length > 0 && !canCreateGroup ? (
                            <TouchableOpacity onPress={() => router.push('/settings/premium')} activeOpacity={0.7}>
                                <Text style={[st.limit, { color: C.textTertiary }]}>
                                    {planName} {maxGroups} grup limitine ulaştın
                                </Text>
                            </TouchableOpacity>
                        ) : null
                    }
                />
            )}
        </View>
    );
}

const st = StyleSheet.create({
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 16 },
    title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
    headerActions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    roundBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

    card: { borderRadius: 20, borderWidth: 1, padding: 18, gap: 14 },
    stale: { opacity: 0.6 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    name: { fontSize: 17, fontWeight: '800' },
    meta: { fontSize: 13, marginTop: 2 },
    role: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
    roleText: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.3 },

    cardFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
    stack: { flexDirection: 'row', alignItems: 'center' },
    stacked: { marginLeft: -10 },
    more: { width: 32, height: 32, borderRadius: 16, borderWidth: 2.5, alignItems: 'center', justifyContent: 'center' },
    moreText: { fontSize: 11, fontWeight: '700' },

    limit: { textAlign: 'center', fontSize: 13, fontWeight: '600', paddingTop: 6 },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    emptyIcon: { width: 64, height: 64, borderRadius: 20, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyTitle: { fontSize: 17, fontWeight: '800' },
    emptyText: { fontSize: 13, fontWeight: '500', textAlign: 'center', maxWidth: 260 },
});
