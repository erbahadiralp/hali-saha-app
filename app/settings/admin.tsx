import { formatDistanceToNow } from 'date-fns';
import { useFocusEffect } from 'expo-router';
import { tr } from 'date-fns/locale';
import { collection, deleteDoc, doc, getDocs, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '../../components/CustomAlertProvider';
import { Avatar, Eyebrow, SecondaryButton, Segmented, Sheet, StateView, toDate } from '../../components/group/GroupUI';
import { SettingsScreen, useSettingsColors } from '../../components/settings/SettingsUI';
import { withOpacity } from '../../constants/designTokens';
import { db } from '../../firebaseConfig';
import { getGroupDetails, getUserProfile } from '../../services/firestore';
import { REPORT_REASONS } from '../../services/reportService';

/** Layout: design/tasarım/macvar-screens-6.html (Admin Panel); colors from designTokens. */

type Tab = 'reports' | 'deleted' | 'sync';

const HIGH_SEVERITY = new Set(['harassment', 'inappropriate_photo']);

const reasonLabel = (reason?: string) => REPORT_REASONS.find(r => r.value === reason)?.label ?? 'Diğer';
const timeAgo = (value: any) => (value ? formatDistanceToNow(toDate(value), { addSuffix: true, locale: tr }) : 'Bilinmeyen tarih');

export default function AdminPanelScreen() {
    const { alert } = useAlert();
    // The alert function changes every render; loaders read it through a ref so effects don't re-run.
    const alertRef = useRef(alert);
    useEffect(() => { alertRef.current = alert; });
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    const [tab, setTab] = useState<Tab>('reports');
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [syncing, setSyncing] = useState(false);
    const [lastSync, setLastSync] = useState<Date | null>(null);
    const [reports, setReports] = useState<any[]>([]);
    const [deletedUsers, setDeletedUsers] = useState<any[]>([]);
    const [selected, setSelected] = useState<any>(null);

    const loadReports = useCallback(async () => {
        const snap = await getDocs(query(collection(db, 'reports'), orderBy('createdAt', 'desc')));
        const raw = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        // Resolve display names once per target/reporter.
        const userIds = [...new Set(raw.flatMap(r => [r.targetUserId, r.reporterId]).filter(Boolean))] as string[];
        const groupIds = [...new Set(raw.map(r => r.targetGroupId).filter(Boolean))] as string[];
        const [users, groups] = await Promise.all([
            Promise.all(userIds.map(id => getUserProfile(id).catch(() => null))),
            Promise.all(groupIds.map(id => getGroupDetails(id).catch(() => null))),
        ]);
        const userMap = new Map(userIds.map((id, i) => [id, users[i] as any]));
        const groupMap = new Map(groupIds.map((id, i) => [id, groups[i] as any]));
        setReports(raw.map(r => ({
            ...r,
            target: r.targetGroupId ? groupMap.get(r.targetGroupId) : userMap.get(r.targetUserId),
            reporter: userMap.get(r.reporterId),
        })));
    }, []);

    const loadDeletedUsers = useCallback(async () => {
        const snap = await getDocs(query(collection(db, 'users'), where('isDeleted', '==', true)));
        const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as any));
        data.sort((a, b) => toDate(b.deletedAt).getTime() - toDate(a.deletedAt).getTime());
        setDeletedUsers(data);
    }, []);

    const load = useCallback(async (which: Tab) => {
        try {
            if (which === 'reports') await loadReports();
            else if (which === 'deleted') await loadDeletedUsers();
        } catch (error) {
            console.error(error);
            alertRef.current('Hata', which === 'reports' ? 'Şikayetler yüklenemedi.' : 'Silinmiş hesaplar yüklenemedi.', [], { type: 'error' });
        }
    }, [loadReports, loadDeletedUsers]);

    // Loads the visible tab on focus and whenever the tab changes.
    useFocusEffect(
        useCallback(() => {
            if (tab === 'sync') return;
            let active = true;
            load(tab).finally(() => { if (active) setLoading(false); });
            return () => { active = false; };
        }, [tab, load])
    );

    const changeTab = (next: Tab) => {
        if (next === tab) return;
        setLoading(next !== 'sync');
        setTab(next);
    };

    const onRefresh = async () => {
        setRefreshing(true);
        await load(tab);
        setRefreshing(false);
    };

    const handleDeleteReport = (report: any) => {
        alert('Şikayeti Sil', 'Bu şikayet kalıcı olarak silinecek. Emin misin?', [
            { text: 'İptal', style: 'cancel' },
            {
                text: 'Sil',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await deleteDoc(doc(db, 'reports', report.id));
                        setReports(prev => prev.filter(r => r.id !== report.id));
                        setSelected(null);
                    } catch {
                        alert('Hata', 'Şikayet silinemedi.', [], { type: 'error' });
                    }
                },
            },
        ], { type: 'warning' });
    };

    const handleSyncUsernames = () => {
        alert('Senkronizasyon', 'Eski kullanıcıların e-posta adresleri usernames koleksiyonuna eklenecek. Emin misin?', [
            { text: 'İptal', style: 'cancel' },
            {
                text: 'Çalıştır',
                onPress: async () => {
                    setSyncing(true);
                    try {
                        const snap = await getDocs(collection(db, 'users'));
                        let count = 0;
                        for (const userDoc of snap.docs) {
                            const data = userDoc.data();
                            if (data.username && data.email) {
                                await setDoc(doc(db, 'usernames', data.username.toLowerCase()), {
                                    uid: userDoc.id,
                                    email: data.email.toLowerCase(),
                                    createdAt: data.createdAt || serverTimestamp(),
                                }, { merge: true });
                                count++;
                            }
                        }
                        setLastSync(new Date());
                        alert('Başarılı', `${count} kullanıcı senkronize edildi.`, [], { type: 'success' });
                    } catch {
                        alert('Hata', 'Senkronizasyon başarısız oldu.', [], { type: 'error' });
                    } finally {
                        setSyncing(false);
                    }
                },
            },
        ]);
    };

    const resolved = (r: any) => r.status === 'reviewed' || r.status === 'dismissed';

    const renderReport = (r: any, i: number) => {
        const high = HIGH_SEVERITY.has(r.reason);
        const sevColor = high ? C.error : C.warning;
        const targetName = r.targetGroupId
            ? `"${r.target?.name || 'Silinmiş grup'}" grubu`
            : `${r.target?.displayName || 'Bilinmeyen kullanıcı'} şikayet edildi`;
        const sub = resolved(r) ? `Çözüldü ve kapatıldı · ${timeAgo(r.createdAt)}` : `${reasonLabel(r.reason)} · ${timeAgo(r.createdAt)}`;
        return (
            <TouchableOpacity
                key={r.id}
                onPress={() => setSelected(r)}
                activeOpacity={0.6}
                style={[st.row, { borderBottomColor: C.divider }, i === reports.length - 1 && st.rowLast, resolved(r) && st.faded]}
            >
                <Avatar uri={r.target?.photoURL || r.target?.imageUrl} name={r.target?.displayName || r.target?.name} size={36} />
                <View style={{ flex: 1 }}>
                    <Text style={[st.rowTitle, { color: C.text }]} numberOfLines={1}>{targetName}</Text>
                    <Text style={[st.rowSub, { color: C.textSecondary }]} numberOfLines={1}>{sub}</Text>
                </View>
                {!resolved(r) && (
                    <View style={[st.chip, { backgroundColor: withOpacity(sevColor, 0.18) }]}>
                        <Text style={[st.chipText, { color: sevColor }]}>{high ? 'Yüksek' : 'Orta'}</Text>
                    </View>
                )}
            </TouchableOpacity>
        );
    };

    const renderDeleted = (u: any, i: number) => (
        <View key={u.id} style={[st.row, { borderBottomColor: C.divider }, i === deletedUsers.length - 1 && st.rowLast]}>
            <Avatar name={u.displayName} size={36} />
            <View style={{ flex: 1 }}>
                <Text style={[st.rowTitle, { color: C.text }]} numberOfLines={1}>
                    {u.displayName || 'İsimsiz'} {u.username ? `(@${u.username})` : ''}
                </Text>
                <Text style={[st.rowSub, { color: C.textSecondary }]} numberOfLines={2}>
                    {u.deletionReason || 'Sebep belirtilmedi'} · {timeAgo(u.deletedAt)}
                </Text>
            </View>
        </View>
    );

    const content = () => {
        if (tab === 'sync') {
            return (
                <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                    <View style={{ flex: 1 }}>
                        <Text style={[st.rowTitle, { color: C.text }]}>Kullanıcı Adı-Email İndeksleme</Text>
                        <Text style={[st.rowSub, { color: C.textTertiary }]}>
                            {lastSync ? `Son senkron: ${timeAgo(lastSync)}` : 'Bu oturumda çalıştırılmadı'}
                        </Text>
                    </View>
                    <TouchableOpacity
                        onPress={handleSyncUsernames}
                        disabled={syncing}
                        style={[st.smallBtn, { backgroundColor: C.card, borderColor: C.border }]}
                    >
                        {syncing ? <ActivityIndicator size="small" color={C.text} /> : <Text style={[st.smallBtnText, { color: C.text }]}>Çalıştır</Text>}
                    </TouchableOpacity>
                </View>
            );
        }
        if (loading) return <ActivityIndicator style={{ marginTop: 48 }} color={C.primaryText} />;
        if (tab === 'reports') {
            return reports.length
                ? reports.map(renderReport)
                : <StateView icon="shield-checkmark-outline" title="Şikayet yok" text="Henüz bekleyen bir şikayet bulunmuyor." />;
        }
        return deletedUsers.length
            ? deletedUsers.map(renderDeleted)
            : <StateView icon="person-remove-outline" title="Silinmiş hesap yok" text="Henüz silinmiş bir hesap bulunmuyor." />;
    };

    return (
        <SettingsScreen title="Admin Panel">
            <View style={st.segWrap}>
                <Segmented
                    options={[
                        { key: 'reports', label: 'Şikayetler' },
                        { key: 'deleted', label: 'Silinen Hesaplar' },
                        { key: 'sync', label: 'DB Sync' },
                    ]}
                    value={tab}
                    onChange={changeTab}
                />
            </View>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: insets.bottom + 32 }}
                refreshControl={tab !== 'sync' ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primaryText} /> : undefined}
            >
                {content()}
            </ScrollView>

            <Sheet visible={!!selected} onClose={() => setSelected(null)} title="Şikayet Detayı">
                {selected && (
                    <View style={{ gap: 14 }}>
                        <DetailRow label="Sebep" value={reasonLabel(selected.reason)} />
                        <DetailRow
                            label={selected.targetGroupId ? 'Grup' : 'Şikayet edilen'}
                            value={selected.targetGroupId ? selected.target?.name || selected.targetGroupId : selected.target?.displayName || selected.targetUserId || 'Bilinmiyor'}
                        />
                        <DetailRow label="Şikayet eden" value={selected.reporter?.displayName || selected.reporterId} />
                        <DetailRow label="Tarih" value={selected.createdAt ? toDate(selected.createdAt).toLocaleString('tr-TR') : 'Bilinmiyor'} />
                        {!!selected.details && <DetailRow label="Açıklama" value={`"${selected.details}"`} />}
                        <SecondaryButton label="Şikayeti Sil" icon="trash-outline" color={C.error} onPress={() => handleDeleteReport(selected)} style={{ marginTop: 6 }} />
                    </View>
                )}
            </Sheet>
        </SettingsScreen>
    );
}

function DetailRow({ label, value }: { label: string; value: string }) {
    const C = useSettingsColors();
    return (
        <View>
            <Eyebrow style={{ marginBottom: 4 }}>{label}</Eyebrow>
            <Text style={[st.detail, { color: C.text }]}>{value}</Text>
        </View>
    );
}

const st = StyleSheet.create({
    segWrap: { paddingHorizontal: 20, marginBottom: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
    rowLast: { borderBottomWidth: 0 },
    faded: { opacity: 0.5 },
    rowTitle: { fontSize: 14, fontWeight: '700' },
    rowSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    chip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    chipText: { fontSize: 11, fontWeight: '800' },
    card: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: 20, borderWidth: 1, padding: 18, marginTop: 6 },
    smallBtn: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 12, borderWidth: 1, minWidth: 82, alignItems: 'center' },
    smallBtnText: { fontSize: 12.5, fontWeight: '700' },
    detail: { fontSize: 14.5, fontWeight: '600', lineHeight: 21 },
});
