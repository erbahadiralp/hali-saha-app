import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '../../../components/CustomAlertProvider';
import { Avatar, Eyebrow, FinBox, PrimaryButton, SecondaryButton, Segmented, Sheet, TextField, compactName, formatTL, toDate } from '../../../components/group/GroupUI';
import { SettingsScreen, useSettingsColors } from '../../../components/settings/SettingsUI';
import { withOpacity } from '../../../constants/designTokens';
import { getMatchDetails, getMatchParticipants, updateMatch, updateMatchPayment } from '../../../services/firestore';

/** Layout: design/tasarım/macvar-screens-2.html (Maç Kasası); colors from designTokens. */

interface ParticipantPayment {
    id: string;
    userId: string;
    name: string;
    status: string;
    paid: boolean;
    paidAmount: number;
}

type CostMode = 'PER_PERSON' | 'TOTAL';

export default function SafeScreen() {
    const { alert } = useAlert();
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    const [match, setMatch] = useState<any>(null);
    const [participants, setParticipants] = useState<ParticipantPayment[]>([]);
    const [loading, setLoading] = useState(true);
    const [costMode, setCostMode] = useState<CostMode>('PER_PERSON');
    const [fee, setFee] = useState('');
    const [totalCost, setTotalCost] = useState('');
    const [savingFee, setSavingFee] = useState(false);

    const [editing, setEditing] = useState<ParticipantPayment | null>(null);
    const [editAmount, setEditAmount] = useState('');

    const loadData = async () => {
        try {
            const matchData: any = await getMatchDetails(id);
            setMatch(matchData);
            if (matchData?.feePerPerson) setFee(String(matchData.feePerPerson));
            const parts: any[] = await getMatchParticipants(id);
            setParticipants(parts.map(p => ({
                ...p,
                paidAmount: p.paidAmount || (p.paid ? Number(matchData?.feePerPerson || 0) : 0),
            })));
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) loadData();
    }, [id]);

    const inParticipants = participants.filter(p => p.status === 'IN');
    const feeValue = parseFloat(fee) || 0;

    const handleCostChange = (text: string) => {
        if (costMode === 'PER_PERSON') {
            setFee(text);
            return;
        }
        setTotalCost(text);
        const total = parseFloat(text);
        if (!isNaN(total)) setFee((total / (inParticipants.length || 1)).toFixed(0));
    };

    const handleSaveFee = async () => {
        if (isNaN(parseFloat(fee))) {
            alert('Hata', 'Geçerli bir ücret gir', [], { type: 'error' });
            return;
        }
        setSavingFee(true);
        try {
            await updateMatch(id, { feePerPerson: parseFloat(fee) });
            setMatch((prev: any) => ({ ...prev, feePerPerson: parseFloat(fee) }));
            alert('Kaydedildi', 'Kişi başı ücret güncellendi', [], { type: 'success' });
        } catch {
            alert('Hata', 'Ücret güncellenemedi', [], { type: 'error' });
        } finally {
            setSavingFee(false);
        }
    };

    const savePayment = async (p: ParticipantPayment, amount: number) => {
        const previous = participants;
        setParticipants(prev => prev.map(x => (x.userId === p.userId ? { ...x, paidAmount: amount, paid: amount > 0 } : x)));
        setEditing(null);
        try {
            await updateMatchPayment(id, p.userId, amount > 0, amount);
        } catch (error) {
            console.error(error);
            setParticipants(previous);
            alert('Hata', 'Ödeme durumu güncellenemedi', [], { type: 'error' });
        }
    };

    const openEditor = (p: ParticipantPayment) => {
        setEditAmount(String(p.paidAmount || 0));
        setEditing(p);
    };

    const statusOf = (p: ParticipantPayment) => {
        const paid = p.paidAmount || 0;
        if (feeValue <= 0) return paid > 0 ? { label: 'Ödedi', color: C.link } : { label: 'Ücretsiz', color: C.textSecondary };
        if (paid === 0) return { label: 'Bekliyor', color: C.warning };
        if (paid < feeValue) return { label: 'Kısmi', color: C.warning };
        if (paid > feeValue) return { label: 'Fazla', color: C.link };
        return { label: 'Ödedi', color: C.link };
    };

    const expected = inParticipants.length * feeValue;
    const collected = inParticipants.reduce((sum, p) => sum + (p.paidAmount || 0), 0);
    const missing = inParticipants.reduce((sum, p) => sum + Math.max(0, feeValue - (p.paidAmount || 0)), 0);
    const surplus = inParticipants.reduce((sum, p) => sum + Math.max(0, (p.paidAmount || 0) - feeValue), 0);

    if (loading) {
        return (
            <SettingsScreen title="Maç Kasası">
                <View style={st.center}><ActivityIndicator size="large" color={C.primaryText} /></View>
            </SettingsScreen>
        );
    }

    return (
        <SettingsScreen title="Maç Kasası">
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                {match && (
                    <Text style={[st.subtitle, { color: C.textSecondary }]}>
                        {match.venue || 'Maç'} · {format(toDate(match.date), 'd MMMM HH:mm', { locale: tr })}
                    </Text>
                )}

                <Segmented<CostMode>
                    options={[{ key: 'PER_PERSON', label: 'Kişi Başı Ücret' }, { key: 'TOTAL', label: 'Toplam Saha Ücreti' }]}
                    value={costMode}
                    onChange={setCostMode}
                />

                <View style={st.feeRow}>
                    <TextField
                        style={{ flex: 1 }}
                        value={costMode === 'PER_PERSON' ? fee : totalCost}
                        onChangeText={handleCostChange}
                        placeholder="0"
                        keyboardType="numeric"
                        right={<Text style={[st.currency, { color: C.textSecondary }]}>₺</Text>}
                    />
                    <PrimaryButton
                        label="Kaydet"
                        onPress={handleSaveFee}
                        disabled={savingFee}
                        loading={savingFee ? <ActivityIndicator color={C.onPrimary} /> : undefined}
                        style={{ height: 50, paddingHorizontal: 20 }}
                    />
                </View>
                {costMode === 'TOTAL' && (
                    <Text style={[st.hint, { color: C.textSecondary }]}>
                        {inParticipants.length} kişi üzerinden kişi başı {formatTL(feeValue)}
                    </Text>
                )}

                <View style={st.finGrid}>
                    <View style={st.finRow}>
                        <FinBox label="Beklenen" value={formatTL(expected)} />
                        <FinBox label="Toplanan" value={formatTL(collected)} color={C.link} />
                    </View>
                    <View style={st.finRow}>
                        <FinBox label="Eksik Bakiye" value={formatTL(missing)} color={missing > 0 ? C.warning : C.text} />
                        <FinBox label="Kasa Fazlası" value={formatTL(surplus)} />
                    </View>
                </View>

                <View style={st.sectionHead}>
                    <Eyebrow>Katılımcılar ({inParticipants.length})</Eyebrow>
                    {!!match?.groupId && (
                        <TouchableOpacity hitSlop={8} onPress={() => router.push(`/group/${match.groupId}/group-debts`)}>
                            <Text style={[st.link, { color: C.link }]}>Grup Kasasını Aç</Text>
                        </TouchableOpacity>
                    )}
                </View>

                {inParticipants.length === 0 ? (
                    <Text style={[st.hint, { color: C.textTertiary, textAlign: 'center', paddingVertical: 24 }]}>Maça katılan oyuncu yok.</Text>
                ) : inParticipants.map((p, i) => {
                    const status = statusOf(p);
                    const amount = feeValue > 0 && p.paidAmount > 0 && p.paidAmount !== feeValue
                        ? `${formatTL(p.paidAmount)} / ${formatTL(feeValue)}`
                        : formatTL(feeValue > 0 ? feeValue : p.paidAmount || 0);
                    return (
                        <TouchableOpacity
                            key={p.id || p.userId}
                            activeOpacity={0.7}
                            onPress={() => openEditor(p)}
                            style={[st.payRow, { borderBottomColor: C.divider }, i === inParticipants.length - 1 && { borderBottomWidth: 0 }]}
                        >
                            <Avatar name={p.name} size={34} />
                            <View style={{ flex: 1 }}>
                                <Text style={[st.payName, { color: C.text }]} numberOfLines={1}>{compactName(p.name)}</Text>
                                <Text style={[st.payAmt, { color: C.textSecondary }]}>{amount}</Text>
                            </View>
                            <View style={[st.chip, { backgroundColor: withOpacity(status.color, 0.16) }]}>
                                <Text style={[st.chipText, { color: status.color }]}>{status.label}</Text>
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            <Sheet visible={!!editing} onClose={() => setEditing(null)} title={editing ? compactName(editing.name) : ''}>
                {editing && (
                    <>
                        <TextField
                            label="Ödenen Tutar"
                            value={editAmount}
                            onChangeText={setEditAmount}
                            keyboardType="numeric"
                            placeholder="0"
                            right={<Text style={[st.currency, { color: C.textSecondary }]}>₺</Text>}
                        />
                        <View style={[st.feeRow, { marginTop: 12 }]}>
                            <SecondaryButton label="Bekliyor" onPress={() => savePayment(editing, 0)} color={C.warning} style={{ flex: 1 }} />
                            <SecondaryButton label="Tam Ödedi" onPress={() => savePayment(editing, feeValue)} color={C.link} disabled={feeValue <= 0} style={{ flex: 1 }} />
                        </View>
                        <PrimaryButton label="Kaydet" onPress={() => savePayment(editing, Math.max(0, parseFloat(editAmount) || 0))} style={{ marginTop: 10 }} />
                    </>
                )}
            </Sheet>
        </SettingsScreen>
    );
}

const st = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    subtitle: { fontSize: 12.5, fontWeight: '600', marginTop: -6, marginBottom: 16 },
    feeRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
    currency: { fontSize: 15, fontWeight: '700' },
    hint: { fontSize: 12, fontWeight: '500', marginTop: 8 },

    finGrid: { gap: 10, marginTop: 16, marginBottom: 18 },
    finRow: { flexDirection: 'row', gap: 10 },

    sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    link: { fontSize: 12, fontWeight: '700' },

    payRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1 },
    payName: { fontSize: 14.5, fontWeight: '700' },
    payAmt: { fontSize: 12.5, fontWeight: '600', marginTop: 1 },
    chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 999 },
    chipText: { fontSize: 11.5, fontWeight: '800' },
});
