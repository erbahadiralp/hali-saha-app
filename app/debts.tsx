import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useFocusEffect, useRouter } from 'expo-router';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { useCallback, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '../components/CustomAlertProvider';
import { SettingsScreen, useSettingsColors } from '../components/settings/SettingsUI';
import { withOpacity } from '../constants/designTokens';
import { useAuth } from '../context/AuthContext';
import { db } from '../firebaseConfig';
import { getGroupDetails, getMatchDetails, getUserProfile } from '../services/firestore';

/** Layout: design/tasarım/macvar-screens-4.html (Kişisel Borçlarım); colors from designTokens. */

interface DebtItem {
    matchId: string;
    venue: string;
    groupName: string | null;
    date: Date;
    amount: number;
    creatorId: string | null;
}

const toDate = (value: any): Date => {
    if (value && typeof value.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    return value ? new Date(value) : new Date();
};

const formatTL = (amount: number) => `₺${amount.toLocaleString('tr-TR')}`;

export default function DebtsScreen() {
    const router = useRouter();
    const { alert } = useAlert();
    const { user } = useAuth();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    const [debts, setDebts] = useState<DebtItem[]>([]);
    const [organizers, setOrganizers] = useState<Record<string, string>>({});
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const fetchDebts = async () => {
        if (!user) return;
        try {
            const snap = await getDocs(query(
                collection(db, 'match_participants'),
                where('userId', '==', user.uid),
                where('status', '==', 'IN')
            ));
            const unpaid = snap.docs.map(d => d.data() as any).filter(p => !p.paid);
            const matches = await Promise.all(unpaid.map(p => getMatchDetails(p.matchId)));

            const owed = matches
                .map((match: any, i) => ({ match, matchId: unpaid[i].matchId as string }))
                .filter(({ match }) => match?.feePerPerson > 0);

            const groupIds = [...new Set(owed.map(({ match }) => match.groupId).filter(Boolean))] as string[];
            const creatorIds = [...new Set(owed.map(({ match }) => match.creatorId).filter((id: string) => id && id !== user.uid))] as string[];

            const [groups, creators] = await Promise.all([
                Promise.all(groupIds.map(id => getGroupDetails(id).catch(() => null))),
                Promise.all(creatorIds.map(id => getUserProfile(id).catch(() => null))),
            ]);
            const groupNames: Record<string, string> = {};
            groups.forEach((g: any, i) => { if (g?.name) groupNames[groupIds[i]] = g.name; });
            const creatorNames: Record<string, string> = {};
            creators.forEach((c: any, i) => { creatorNames[creatorIds[i]] = c?.displayName || 'Organizatör'; });

            const items: DebtItem[] = owed.map(({ match, matchId }) => ({
                matchId,
                venue: match.venue || 'Maç',
                groupName: match.groupId ? groupNames[match.groupId] ?? null : null,
                date: toDate(match.date),
                amount: match.feePerPerson,
                creatorId: match.creatorId && match.creatorId !== user.uid ? match.creatorId : null,
            }));
            items.sort((a, b) => b.date.getTime() - a.date.getTime());

            setDebts(items);
            setOrganizers(creatorNames);
        } catch (error) {
            console.error('Failed to fetch debts:', error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            fetchDebts();
        }, [user])
    );

    const totalDebt = debts.reduce((sum, d) => sum + d.amount, 0);
    const organizerIds = Object.keys(organizers);

    // The match creator collects the fee, so they are the "kasa sorumlusu".
    const contactTreasurer = () => {
        if (organizerIds.length === 1) {
            router.push(`/user/${organizerIds[0]}`);
            return;
        }
        alert(
            'Kasa Sorumlusu',
            'Ulaşmak istediğin kişiyi seç',
            [
                ...organizerIds.map(id => ({ text: organizers[id], onPress: () => router.push(`/user/${id}`) })),
                { text: 'İptal', style: 'cancel' as const },
            ]
        );
    };

    return (
        <SettingsScreen title="Borçlarım">
            {loading ? (
                <View style={st.center}>
                    <ActivityIndicator size="large" color={C.primaryText} />
                </View>
            ) : (
                <View style={[st.body, { paddingBottom: insets.bottom + 16 }]}>
                    <View style={[st.summary, { backgroundColor: C.card, borderColor: C.border }]}>
                        <Text style={[st.eyebrow, { color: C.textSecondary }]}>Toplam Birikmiş Borç</Text>
                        <Text style={[st.total, { color: totalDebt > 0 ? C.error : C.link }]}>{formatTL(totalDebt)}</Text>
                        <Text style={[st.summarySub, { color: C.textSecondary }]}>
                            {totalDebt > 0 ? `${debts.length} maçtan ödenmemiş ücret` : 'Tüm maç ödemelerin tamam'}
                        </Text>
                    </View>

                    <ScrollView
                        style={{ flex: 1 }}
                        contentContainerStyle={{ paddingBottom: 8, flexGrow: 1 }}
                        showsVerticalScrollIndicator={false}
                        refreshControl={
                            <RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); fetchDebts(); }} tintColor={C.primaryText} />
                        }
                    >
                        {debts.length === 0 ? (
                            <View style={st.empty}>
                                <View style={[st.emptyIcon, { backgroundColor: withOpacity(C.accent, 0.12) }]}>
                                    <Ionicons name="checkmark-done" size={28} color={C.link} />
                                </View>
                                <Text style={[st.emptyTitle, { color: C.text }]}>Hiç borcun yok</Text>
                                <Text style={[st.emptyText, { color: C.textSecondary }]}>
                                    Katıldığın tüm maçların ödemelerini eksiksiz yaptın.
                                </Text>
                            </View>
                        ) : debts.map((debt, index) => (
                            <TouchableOpacity
                                key={debt.matchId}
                                onPress={() => router.push(`/match/${debt.matchId}`)}
                                activeOpacity={0.7}
                                style={[
                                    st.item,
                                    { borderBottomColor: C.divider },
                                    index === debts.length - 1 && { borderBottomWidth: 0 },
                                ]}
                            >
                                <View style={[st.itemIcon, { backgroundColor: withOpacity(C.accent, 0.12) }]}>
                                    <Ionicons name="football" size={20} color={C.link} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[st.itemTitle, { color: C.text }]} numberOfLines={1}>{debt.venue}</Text>
                                    <Text style={[st.itemSub, { color: C.textSecondary }]} numberOfLines={1}>
                                        {[format(debt.date, 'd MMMM', { locale: tr }), debt.groupName].filter(Boolean).join(' · ')}
                                    </Text>
                                </View>
                                <Text style={[st.itemAmount, { color: C.error }]}>{formatTL(debt.amount)}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    {organizerIds.length > 0 && (
                        <TouchableOpacity
                            onPress={contactTreasurer}
                            activeOpacity={0.8}
                            style={[st.secondaryBtn, { backgroundColor: C.card, borderColor: C.border }]}
                        >
                            <Text style={[st.secondaryBtnText, { color: C.text }]}>Kasa Sorumlusuna Ulaş</Text>
                        </TouchableOpacity>
                    )}
                </View>
            )}
        </SettingsScreen>
    );
}

const st = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    body: { flex: 1, paddingHorizontal: 16 },

    summary: { borderRadius: 20, borderWidth: 1, padding: 18, marginBottom: 18 },
    eyebrow: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7, marginBottom: 6 },
    total: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
    summarySub: { fontSize: 12, fontWeight: '600', marginTop: 4 },

    item: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 14, borderBottomWidth: 1 },
    itemIcon: { width: 42, height: 42, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    itemTitle: { fontSize: 14, fontWeight: '700' },
    itemSub: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },
    itemAmount: { fontSize: 15, fontWeight: '800' },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 40, gap: 8 },
    emptyIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyTitle: { fontSize: 17, fontWeight: '800' },
    emptyText: { fontSize: 13, fontWeight: '500', textAlign: 'center', maxWidth: 260 },

    secondaryBtn: { borderRadius: 16, borderWidth: 1, paddingVertical: 14, alignItems: 'center', marginTop: 12 },
    secondaryBtnText: { fontSize: 15, fontWeight: '700' },
});
