import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, LayoutAnimation, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '../../../components/CustomAlertProvider';
import { Avatar, FinBox, TabStrip, formatTL, toDate } from '../../../components/group/GroupUI';
import { SettingsScreen, useSettingsColors } from '../../../components/settings/SettingsUI';
import { withOpacity } from '../../../constants/designTokens';
import { useAuth } from '../../../context/AuthContext';
import { getGroupDetails, getGroupMatches, getGroupMembers, getMatchParticipants, updateMatchPayment } from '../../../services/firestore';

/** Layout: design/tasarım/macvar-screens-3.html (Grup Kasası & Borç Matrisi); colors from designTokens. */

type Tab = 'matches' | 'players';

interface UnpaidEntry {
    matchId: string;
    venue: string;
    date: Date;
    fee: number;
}

interface PlayerLedger {
    uid: string;
    name: string;
    photoURL?: string;
    joined: number;
    owed: number;
    unpaid: UnpaidEntry[];
}

const paidAmountOf = (p: any, fee: number) => (p.paidAmount !== undefined ? p.paidAmount : fee);

export default function GroupDebtsScreen() {
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { user } = useAuth();
    const { alert } = useAlert();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [tab, setTab] = useState<Tab>('players');
    const [group, setGroup] = useState<any>(null);
    const [matches, setMatches] = useState<any[]>([]);
    const [members, setMembers] = useState<any[]>([]);
    const [participantsMap, setParticipantsMap] = useState<Record<string, any[]>>({});
    const [expanded, setExpanded] = useState<string | null>(null);

    const loadData = async (isRefresh = false) => {
        if (!id) return;
        if (!isRefresh) setLoading(true);
        try {
            const groupData: any = await getGroupDetails(id);
            if (!groupData) {
                alert('Hata', 'Grup bulunamadı.', [], { type: 'error' });
                router.back();
                return;
            }
            const admins: string[] = groupData.admins || (groupData.adminId ? [groupData.adminId] : []);
            if (!user || (groupData.adminId !== user.uid && !admins.includes(user.uid))) {
                alert('Yetki Hatası', 'Bu sayfaya sadece grup yöneticileri erişebilir.', [], { type: 'error' });
                router.back();
                return;
            }
            setGroup(groupData);

            const [allMatches, allMembers] = await Promise.all([getGroupMatches(id), getGroupMembers(id)]);
            // Only paid matches matter for the ledger.
            const paidMatches = (allMatches as any[])
                .filter(m => (m.feePerPerson || 0) > 0)
                .sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime());

            const pMap: Record<string, any[]> = {};
            await Promise.all(paidMatches.map(async m => {
                try {
                    pMap[m.id] = (await getMatchParticipants(m.id)).filter((p: any) => p.status === 'IN');
                } catch (e) {
                    console.error(`Error fetching participants for match ${m.id}:`, e);
                    pMap[m.id] = [];
                }
            }));

            setMatches(paidMatches);
            setMembers(allMembers || []);
            setParticipantsMap(pMap);
        } catch (error) {
            console.error('Error loading group debts data:', error);
            alert('Hata', 'Veriler yüklenirken bir hata oluştu.', [], { type: 'error' });
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            if (id) loadData(true);
        }, [id])
    );

    const setPaid = (updates: { matchId: string; userId: string; paid: boolean; fee: number }[]) => {
        setParticipantsMap(prev => {
            const next = { ...prev };
            updates.forEach(({ matchId, userId, paid, fee }) => {
                next[matchId] = (next[matchId] || []).map(p => (p.userId === userId ? { ...p, paid, paidAmount: paid ? fee : 0 } : p));
            });
            return next;
        });
        Promise.all(updates.map(u => updateMatchPayment(u.matchId, u.userId, u.paid, u.paid ? u.fee : 0))).catch(error => {
            console.error('Error updating payment:', error);
            alert('Hata', 'Ödeme durumu güncellenemedi.', [], { type: 'error' });
            loadData(true);
        });
    };

    const stats = useMemo(() => {
        let expected = 0;
        let collected = 0;
        matches.forEach(m => {
            const fee = m.feePerPerson || 0;
            (participantsMap[m.id] || []).forEach(p => {
                expected += fee;
                if (p.paid) collected += paidAmountOf(p, fee);
            });
        });
        return { expected, collected, remaining: Math.max(0, expected - collected), rate: expected > 0 ? Math.round((collected / expected) * 100) : 0 };
    }, [matches, participantsMap]);

    const ledger = useMemo<PlayerLedger[]>(() => {
        const byUid = new Map<string, PlayerLedger>();
        const ensure = (uid: string, name?: string, photoURL?: string) => {
            if (!byUid.has(uid)) byUid.set(uid, { uid, name: name || 'İsimsiz', photoURL, joined: 0, owed: 0, unpaid: [] });
            return byUid.get(uid)!;
        };
        members.forEach(m => ensure(m.uid || m.odaylarId, m.displayName || m.name, m.photoURL));
        matches.forEach(m => {
            const fee = m.feePerPerson || 0;
            (participantsMap[m.id] || []).forEach(p => {
                // Former members who still owe for past matches are kept in the ledger.
                const row = ensure(p.userId, p.name);
                row.joined += 1;
                if (!p.paid) {
                    row.owed += fee;
                    row.unpaid.push({ matchId: m.id, venue: m.venue || 'Maç', date: toDate(m.date), fee });
                }
            });
        });
        return [...byUid.values()].sort((a, b) => b.owed - a.owed || a.name.localeCompare(b.name, 'tr'));
    }, [members, matches, participantsMap]);

    const toggleExpanded = (key: string) => {
        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setExpanded(prev => (prev === key ? null : key));
    };

    const confirmSettleAll = (player: PlayerLedger) => {
        alert(
            'Ödeme Alındı',
            `${player.name} için ${player.unpaid.length} maçlık ${formatTL(player.owed)} ödeme alındı olarak işaretlensin mi?`,
            [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'İşaretle', onPress: () => setPaid(player.unpaid.map(u => ({ matchId: u.matchId, userId: player.uid, paid: true, fee: u.fee }))) },
            ]
        );
    };

    const renderPlayers = () => {
        if (ledger.length === 0) return <Empty icon="people-outline" text="Grupta üye bulunamadı" />;
        return ledger.map((player, index) => {
            const settled = player.owed === 0;
            const open = expanded === `p-${player.uid}`;
            return (
                <View key={player.uid} style={[st.row, { borderBottomColor: C.divider }, index === ledger.length - 1 && st.rowLast]}>
                    <TouchableOpacity
                        activeOpacity={0.7}
                        disabled={settled}
                        onPress={() => toggleExpanded(`p-${player.uid}`)}
                        style={[st.rowMain, settled && st.dimmed]}
                    >
                        <Avatar uri={player.photoURL} name={player.name} size={38} />
                        <View style={{ flex: 1 }}>
                            <Text style={[st.rowTitle, { color: C.text }]} numberOfLines={1}>{player.name}</Text>
                            <Text style={[st.rowSub, { color: C.textSecondary }]}>
                                {settled ? (player.joined > 0 ? 'Tüm borçlar ödendi' : 'Ücretli maça katılmadı') : `${player.unpaid.length} maçtan borç`}
                            </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[st.amount, { color: settled ? C.link : C.error }]}>{formatTL(player.owed)}</Text>
                            {!settled && (
                                <TouchableOpacity onPress={() => confirmSettleAll(player)} hitSlop={8}>
                                    <Text style={[st.settle, { color: C.link }]}>Ödeme Alındı İşaretle</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    </TouchableOpacity>

                    {open && (
                        <View style={[st.detail, { backgroundColor: C.card, borderColor: C.border }]}>
                            {player.unpaid.map((u, i) => (
                                <View key={u.matchId} style={[st.detailRow, { borderBottomColor: C.divider }, i === player.unpaid.length - 1 && st.rowLast]}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[st.detailTitle, { color: C.text }]} numberOfLines={1}>{u.venue}</Text>
                                        <Text style={[st.detailSub, { color: C.textTertiary }]}>{format(u.date, 'd MMMM yyyy', { locale: tr })}</Text>
                                    </View>
                                    <StatusChip
                                        paid={false}
                                        label={`Ödeme Al · ${formatTL(u.fee)}`}
                                        onPress={() => setPaid([{ matchId: u.matchId, userId: player.uid, paid: true, fee: u.fee }])}
                                    />
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            );
        });
    };

    const renderMatches = () => {
        if (matches.length === 0) return <Empty icon="receipt-outline" text="Grupta henüz ücretli maç yok" />;
        return matches.map((m, index) => {
            const fee = m.feePerPerson || 0;
            const participants = participantsMap[m.id] || [];
            const paidCount = participants.filter(p => p.paid).length;
            const collected = participants.reduce((sum, p) => sum + (p.paid ? paidAmountOf(p, fee) : 0), 0);
            const expectedTotal = participants.length * fee;
            const complete = participants.length > 0 && paidCount === participants.length;
            const open = expanded === `m-${m.id}`;
            return (
                <View key={m.id} style={[st.row, { borderBottomColor: C.divider }, index === matches.length - 1 && st.rowLast]}>
                    <TouchableOpacity activeOpacity={0.7} onPress={() => toggleExpanded(`m-${m.id}`)} style={st.rowMain}>
                        <View style={[st.matchIcon, { backgroundColor: withOpacity(C.accent, 0.12) }]}>
                            <Ionicons name="football" size={18} color={C.link} />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={[st.rowTitle, { color: C.text }]} numberOfLines={1}>{m.venue || 'Maç'}</Text>
                            <Text style={[st.rowSub, { color: C.textSecondary }]} numberOfLines={1}>
                                {format(toDate(m.date), 'd MMMM · HH:mm', { locale: tr })} · {paidCount}/{participants.length} ödedi
                            </Text>
                        </View>
                        <View style={{ alignItems: 'flex-end' }}>
                            <Text style={[st.amount, { color: complete ? C.link : C.text }]}>{formatTL(collected)}</Text>
                            <Text style={[st.rowSub, { color: C.textTertiary }]}>/ {formatTL(expectedTotal)}</Text>
                        </View>
                        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={18} color={C.textTertiary} />
                    </TouchableOpacity>

                    {open && (
                        <View style={[st.detail, { backgroundColor: C.card, borderColor: C.border }]}>
                            {participants.length === 0 ? (
                                <Text style={[st.detailSub, { color: C.textTertiary, textAlign: 'center', paddingVertical: 10 }]}>Bu maça katılan oyuncu yok.</Text>
                            ) : participants.map((p, i) => (
                                <View key={p.userId} style={[st.detailRow, { borderBottomColor: C.divider }, i === participants.length - 1 && st.rowLast]}>
                                    <Text style={[st.detailTitle, { color: C.text, flex: 1 }]} numberOfLines={1}>{p.name || 'İsimsiz'}</Text>
                                    <StatusChip
                                        paid={!!p.paid}
                                        label={p.paid ? 'Ödedi' : 'Bekliyor'}
                                        onPress={() => setPaid([{ matchId: m.id, userId: p.userId, paid: !p.paid, fee }])}
                                    />
                                </View>
                            ))}
                        </View>
                    )}
                </View>
            );
        });
    };

    return (
        <SettingsScreen title="Grup Kasası">
            {loading ? (
                <View style={st.center}><ActivityIndicator size="large" color={C.primaryText} /></View>
            ) : (
                <ScrollView
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(true); }} tintColor={C.primaryText} />}
                >
                    {!!group?.name && <Text style={[st.subtitle, { color: C.textSecondary }]}>{group.name}</Text>}

                    <View style={st.finGrid}>
                        <View style={st.finRow}>
                            <FinBox label="Toplanan" value={formatTL(stats.collected)} color={C.link} />
                            <FinBox label="Kalan Borç" value={formatTL(stats.remaining)} color={stats.remaining > 0 ? C.error : C.text} />
                        </View>
                        <View style={st.finRow}>
                            <FinBox label="Beklenen Toplam" value={formatTL(stats.expected)} />
                            <FinBox label="Tahsilat Oranı" value={`%${stats.rate}`} />
                        </View>
                    </View>

                    <TabStrip<Tab>
                        tabs={[{ key: 'matches', label: 'Maçlar Bazında' }, { key: 'players', label: 'Oyuncular Bazında' }]}
                        active={tab}
                        onChange={key => { setExpanded(null); setTab(key); }}
                    />

                    {tab === 'players' ? renderPlayers() : renderMatches()}
                </ScrollView>
            )}
        </SettingsScreen>
    );
}

function StatusChip({ paid, label, onPress }: { paid: boolean; label: string; onPress: () => void }) {
    const C = useSettingsColors();
    const color = paid ? C.link : C.warning;
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7} style={[st.chip, { backgroundColor: withOpacity(color, 0.16) }]}>
            <Text style={[st.chipText, { color }]}>{label}</Text>
        </TouchableOpacity>
    );
}

function Empty({ icon, text }: { icon: keyof typeof Ionicons.glyphMap; text: string }) {
    const C = useSettingsColors();
    return (
        <View style={st.empty}>
            <Ionicons name={icon} size={36} color={C.textTertiary} />
            <Text style={[st.emptyText, { color: C.textSecondary }]}>{text}</Text>
        </View>
    );
}

const st = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    subtitle: { fontSize: 12.5, fontWeight: '600', marginTop: -6, marginBottom: 14 },

    finGrid: { gap: 10, marginBottom: 18 },
    finRow: { flexDirection: 'row', gap: 10 },

    row: { borderBottomWidth: 1, paddingVertical: 12 },
    rowLast: { borderBottomWidth: 0 },
    rowMain: { flexDirection: 'row', alignItems: 'center', gap: 12 },
    dimmed: { opacity: 0.5 },
    rowTitle: { fontSize: 14, fontWeight: '700' },
    rowSub: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },
    amount: { fontSize: 14.5, fontWeight: '800' },
    settle: { fontSize: 10.5, fontWeight: '700', marginTop: 2 },
    matchIcon: { width: 38, height: 38, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },

    detail: { marginTop: 10, borderRadius: 14, borderWidth: 1, paddingHorizontal: 12 },
    detailRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth },
    detailTitle: { fontSize: 13, fontWeight: '600' },
    detailSub: { fontSize: 11, marginTop: 1 },

    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
    chipText: { fontSize: 11.5, fontWeight: '800' },

    empty: { alignItems: 'center', paddingVertical: 48, gap: 10 },
    emptyText: { fontSize: 13, fontWeight: '500' },
});
