import { Ionicons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useFocusEffect, useRouter } from 'expo-router';
import { ReactNode, useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Eyebrow, Stepper, toDate } from '../../components/group/GroupUI';
import { SettingsScreen, useSettingsColors } from '../../components/settings/SettingsUI';
import { withOpacity } from '../../constants/designTokens';
import { useAuth } from '../../context/AuthContext';
import { getGroupMatches, getUserGroups, isAdminOfGroup } from '../../services/firestore';
import {
    BalanceReport,
    BotUids,
    assignBotLevels,
    balanceReport,
    botLeavesMatch,
    botsEnterStats,
    botsJoinGroup,
    botsJoinMatch,
    botsVoteMvp,
    cleanupTestLab,
    closeMvpVoting,
    createTestMatch,
    finishMatch,
    prepareBots,
    warpMatchToEnded,
} from '../../services/testLab/actions';
import { BOTS } from '../../services/testLab/bots';

/**
 * Test Lab (development only): 16 bot accounts play the other roles so multi-user features —
 * roster and waitlist, team balancing, stats entry and MVP voting — can be tested on one phone.
 * Colors from designTokens.
 */

const STATUS_LABELS: Record<string, string> = { UPCOMING: 'Yaklaşan', FINISHED: 'Bitti', STATS_LOCKED: 'Kilitli' };

export default function TestLabScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    const [uids, setUids] = useState<BotUids | null>(null);
    const [groups, setGroups] = useState<any[]>([]);
    const [groupId, setGroupId] = useState<string | null>(null);
    const [matches, setMatches] = useState<any[]>([]);
    const [matchId, setMatchId] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [logs, setLogs] = useState<string[]>([]);
    const [report, setReport] = useState<BalanceReport | null>(null);
    const [joinCount, setJoinCount] = useState(14);
    const [maxPlayers, setMaxPlayers] = useState(14);
    const [scoreA, setScoreA] = useState(4);
    const [scoreB, setScoreB] = useState(3);

    const log = useCallback((line: string) => setLogs(prev => [`${format(new Date(), 'HH:mm:ss')}  ${line}`, ...prev].slice(0, 80)), []);

    const loadMatches = useCallback(async (gid: string) => {
        const list: any[] = await getGroupMatches(gid);
        setMatches(list.sort((a, b) => toDate(b.date).getTime() - toDate(a.date).getTime()).slice(0, 8));
    }, []);

    useFocusEffect(
        useCallback(() => {
            if (!user) return;
            getUserGroups(user.uid).then(list => setGroups(list.filter(g => isAdminOfGroup(g, user.uid)))).catch(console.error);
            if (groupId) loadMatches(groupId).catch(console.error);
        }, [user, groupId, loadMatches])
    );

    const run = async (key: string, task: () => Promise<void>) => {
        if (busy) return;
        setBusy(key);
        try {
            await task();
        } catch (error: any) {
            console.error(`[TestLab] ${key}`, error);
            log(`✗ ${error?.message || 'İşlem başarısız'}`);
        } finally {
            setBusy(null);
        }
    };

    const needBots = () => {
        if (!uids) throw new Error('Önce botları hazırla.');
        return uids;
    };
    const needGroup = () => {
        if (!groupId) throw new Error('Önce bir grup seç.');
        return groupId;
    };
    const needMatch = () => {
        if (!matchId) throw new Error('Önce bir maç seç veya oluştur.');
        return matchId;
    };

    const selectGroup = (id: string) => {
        setGroupId(id);
        setMatchId(null);
        setReport(null);
        loadMatches(id).catch(console.error);
    };

    const selectedMatch = matches.find(m => m.id === matchId);

    const action = (key: string, label: string, icon: keyof typeof Ionicons.glyphMap, task: () => Promise<void>, hint?: string) => (
        <TouchableOpacity
            key={key}
            onPress={() => run(key, task)}
            disabled={!!busy}
            activeOpacity={0.7}
            style={[st.action, { backgroundColor: C.card, borderColor: C.border }, busy && busy !== key && st.dimmed]}
        >
            <View style={[st.actionIcon, { backgroundColor: C.iconTile }]}>
                {busy === key ? <ActivityIndicator size="small" color={C.link} /> : <Ionicons name={icon} size={17} color={C.link} />}
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[st.actionLabel, { color: C.text }]}>{label}</Text>
                {!!hint && <Text style={[st.actionHint, { color: C.textTertiary }]}>{hint}</Text>}
            </View>
        </TouchableOpacity>
    );

    const section = (step: string, title: string, children: ReactNode) => (
        <View style={st.section}>
            <Eyebrow style={{ marginBottom: 10 }}>{`${step} · ${title}`}</Eyebrow>
            <View style={{ gap: 8 }}>{children}</View>
        </View>
    );

    const chip = (key: string, label: string, on: boolean, onPress: () => void) => (
        <TouchableOpacity
            key={key}
            onPress={onPress}
            activeOpacity={0.7}
            style={[st.chip, { backgroundColor: on ? withOpacity(C.primary, 0.14) : C.iconTile, borderColor: on ? C.primary : C.transparent }]}
        >
            <Text style={[st.chipText, { color: on ? C.link : C.textSecondary }]} numberOfLines={1}>{label}</Text>
        </TouchableOpacity>
    );

    const stepperRow = (label: string, value: number, onChange: (v: number) => void, min: number, max: number) => (
        <View style={[st.stepperRow, { borderColor: C.border, backgroundColor: C.card }]}>
            <Text style={[st.actionLabel, { color: C.text, flex: 1 }]}>{label}</Text>
            <Stepper value={value} onChange={onChange} min={min} max={max} />
        </View>
    );

    const teamColumn = (label: string, team: BalanceReport['A']) => (
        <View style={{ flex: 1 }}>
            <Text style={[st.teamTitle, { color: C.text }]}>{label}</Text>
            <Text style={[st.teamAvg, { color: C.link }]}>{team.average}</Text>
            <Text style={[st.teamMeta, { color: C.textSecondary }]}>
                {team.count} oyuncu · GK {team.positions.GK} · DEF {team.positions.DF} · MID {team.positions.MF} · FWD {team.positions.FW}
            </Text>
            {team.players.map((p, i) => (
                <Text key={`${p.name}-${i}`} style={[st.teamPlayer, { color: C.textSecondary }]} numberOfLines={1}>
                    {p.rating} · {p.position} · {p.name}
                </Text>
            ))}
        </View>
    );

    return (
        <SettingsScreen title="Test Lab">
            <ScrollView contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
                <View style={[st.info, { backgroundColor: withOpacity(C.warning, 0.1), borderColor: withOpacity(C.warning, 0.3) }]}>
                    <Ionicons name="flask-outline" size={18} color={C.warning} />
                    <Text style={[st.infoText, { color: C.textSecondary }]}>
                        Botlar gerçek hesaplardır ve kendi oturumlarıyla işlem yapar; güvenlik kuralları ve Cloud Functions gerçek kullanıcıdaki gibi çalışır. Organizatör adımlarını sen yaparsın.
                    </Text>
                </View>

                {section('1', 'Botlar', (
                    <>
                        {action('prepare', uids ? `${Object.keys(uids).length} bot hazır` : '16 Botu Hazırla', 'people-outline', async () => {
                            setUids(await prepareBots(log));
                        }, `${BOTS.filter(b => b.position === 'GK').length} kaleci, ${BOTS.filter(b => b.position === 'DEF').length} defans, ${BOTS.filter(b => b.position === 'MID').length} orta saha, ${BOTS.filter(b => b.position === 'FWD').length} forvet · seviye 3-9`)}
                    </>
                ))}

                {section('2', 'Grup', (
                    <>
                        {groups.length === 0 ? (
                            <Text style={[st.empty, { color: C.textTertiary }]}>Yönetici olduğun bir grup yok. Önce grup oluştur.</Text>
                        ) : (
                            <View style={st.chips}>{groups.map(g => chip(g.id, g.name, g.id === groupId, () => selectGroup(g.id)))}</View>
                        )}
                        {action('joinGroup', 'Botları Gruba Ekle', 'person-add-outline', () => botsJoinGroup(needGroup(), needBots(), log), 'Açık grupta kendileri katılır; gizli grupta istek atar, sen onaylarsın')}
                        {action('levels', 'Bot Seviyelerini Ata', 'speedometer-outline', () => assignBotLevels(needGroup(), needBots(), log), 'Oyuncu Güçleri’ndeki gibi seviye ve arketip')}
                    </>
                ))}

                {section('3', 'Maç ve Kadro', (
                    <>
                        {stepperRow('Yeni maç kapasitesi', maxPlayers, setMaxPlayers, 4, 30)}
                        {action('createMatch', 'Test Maçı Oluştur', 'add-circle-outline', async () => {
                            const gid = needGroup();
                            const id = await createTestMatch(gid, maxPlayers, log);
                            await loadMatches(gid);
                            setMatchId(id);
                            setReport(null);
                        })}
                        {matches.length > 0 && (
                            <View style={st.chips}>
                                {matches.map(m => chip(
                                    m.id,
                                    `${format(toDate(m.date), 'd MMM HH:mm', { locale: tr })} · ${STATUS_LABELS[m.status] ?? m.status}`,
                                    m.id === matchId,
                                    () => { setMatchId(m.id); setReport(null); },
                                ))}
                            </View>
                        )}
                        {selectedMatch && (
                            <Text style={[st.empty, { color: C.textSecondary }]}>
                                {selectedMatch.venue} · {selectedMatch.playerCount ?? 0}/{selectedMatch.maxPlayers ?? '?'} oyuncu
                            </Text>
                        )}
                        {stepperRow('Katılacak bot sayısı', joinCount, setJoinCount, 1, 16)}
                        {action('joinMatch', 'Botları Kadroya Al', 'enter-outline', async () => {
                            const id = needMatch();
                            await botsJoinMatch(id, needBots(), joinCount, log);
                            if (groupId) await loadMatches(groupId);
                        }, 'Kapasite dolunca kalanlar yedeğe geçer')}
                        {action('leave', 'Bir Bot Kadrodan Çıksın', 'exit-outline', async () => {
                            await botLeavesMatch(needMatch(), needBots(), log);
                            if (groupId) await loadMatches(groupId);
                        }, 'Yedekten otomatik kadroya alma testi')}
                        {action('builder', 'Kadro Kurucuyu Aç', 'git-compare-outline', async () => {
                            router.push(`/match/${needMatch()}/team-builder`);
                        }, 'Akıllı dağıt → kaydet (Kaptan Pro gerekir; sandbox’tan açabilirsin)')}
                        {action('report', 'Denge Raporu', 'analytics-outline', async () => {
                            setReport(await balanceReport(needMatch()));
                        })}
                        {report && (
                            <View style={[st.report, { backgroundColor: C.card, borderColor: C.border }]}>
                                <View style={st.teams}>
                                    {teamColumn('Takım A', report.A)}
                                    <View style={[st.vDivider, { backgroundColor: C.divider }]} />
                                    {teamColumn('Takım B', report.B)}
                                </View>
                                <Text style={[st.teamMeta, { color: C.textSecondary, marginTop: 10 }]}>
                                    Ortalama farkı: {report.averageDiff}{report.unassigned ? ` · takımsız ${report.unassigned}` : ''}
                                </Text>
                                {report.notes.map(n => (
                                    <Text key={n} style={[st.teamPlayer, { color: C.text }]}>• {n}</Text>
                                ))}
                            </View>
                        )}
                    </>
                ))}

                {section('4', 'Maç Sonu ve MVP', (
                    <>
                        {action('warp', 'Maçı 15 dk Önce Bitmiş Yap', 'time-outline', () => warpMatchToEnded(needMatch(), 15, log), 'Başlama saatini geçmişe alır; MVP penceresi açılır')}
                        <View style={[st.stepperRow, { borderColor: C.border, backgroundColor: C.card }]}>
                            <Text style={[st.actionLabel, { color: C.text, flex: 1 }]}>Skor</Text>
                            <Stepper value={scoreA} onChange={setScoreA} min={0} max={20} />
                            <Text style={[st.actionLabel, { color: C.textSecondary }]}>-</Text>
                            <Stepper value={scoreB} onChange={setScoreB} min={0} max={20} />
                        </View>
                        {action('finish', 'Skoru Gir ve Maçı Bitir', 'flag-outline', async () => {
                            await finishMatch(needMatch(), scoreA, scoreB, log);
                            if (groupId) await loadMatches(groupId);
                        })}
                        {action('stats', 'Botlar İstatistik Girsin', 'stats-chart-outline', () => botsEnterStats(needMatch(), needBots(), log), 'Goller mevkiye ve seviyeye göre dağıtılır')}
                        {action('vote', 'Botlar MVP Oylasın', 'trophy-outline', () => botsVoteMvp(needMatch(), needBots(), log), 'İyi oynayan düelloları daha sık kazanır')}
                        {action('openVote', 'MVP Ekranını Aç', 'open-outline', async () => { router.push(`/match/${needMatch()}/mvp-vote`); })}
                        {action('close', 'Oylamayı Kapat', 'lock-closed-outline', () => closeMvpVoting(needMatch(), log), 'Kazanan maça ve oyuncu profiline yazılır (profil sayıları sunucuda güncellenir)')}
                        {action('openMatch', 'Maç Detayını Aç', 'football-outline', async () => { router.push(`/match/${needMatch()}`); })}
                    </>
                ))}

                {section('5', 'Temizlik', (
                    <>
                        {action('cleanup', 'Test Maçlarını İptal Et ve Botları Gruptan Çıkar', 'trash-outline', async () => {
                            await cleanupTestLab(groupId, uids ?? {}, log);
                            setMatchId(null);
                            setReport(null);
                            if (groupId) await loadMatches(groupId);
                        })}
                    </>
                ))}

                <View style={[st.console, { backgroundColor: C.sheet, borderColor: C.border }]}>
                    <View style={st.consoleHead}>
                        <Eyebrow>Kayıt</Eyebrow>
                        {logs.length > 0 && (
                            <TouchableOpacity onPress={() => setLogs([])} hitSlop={8}>
                                <Text style={[st.actionHint, { color: C.link }]}>Temizle</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    {logs.length === 0
                        ? <Text style={[st.logLine, { color: C.textTertiary }]}>Henüz işlem yok.</Text>
                        : logs.map((line, i) => <Text key={`${i}-${line}`} style={[st.logLine, { color: line.includes('✗') ? C.error : C.textSecondary }]}>{line}</Text>)}
                </View>
            </ScrollView>
        </SettingsScreen>
    );
}

const st = StyleSheet.create({
    content: { paddingHorizontal: 20, gap: 4 },
    info: { flexDirection: 'row', gap: 10, borderWidth: 1, borderRadius: 16, padding: 14, marginBottom: 8 },
    infoText: { flex: 1, fontSize: 12.5, fontWeight: '600', lineHeight: 19 },
    section: { marginTop: 16 },
    action: { flexDirection: 'row', alignItems: 'center', gap: 12, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 12 },
    actionIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    actionLabel: { fontSize: 14, fontWeight: '700' },
    actionHint: { fontSize: 11.5, fontWeight: '600', marginTop: 2 },
    dimmed: { opacity: 0.45 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12, borderWidth: 1.5, maxWidth: '100%' },
    chipText: { fontSize: 12.5, fontWeight: '700' },
    empty: { fontSize: 12.5, fontWeight: '600' },
    stepperRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 8 },
    report: { borderWidth: 1, borderRadius: 16, padding: 14 },
    teams: { flexDirection: 'row', gap: 12 },
    vDivider: { width: StyleSheet.hairlineWidth },
    teamTitle: { fontSize: 13, fontWeight: '800' },
    teamAvg: { fontSize: 28, fontWeight: '800', marginVertical: 2 },
    teamMeta: { fontSize: 11.5, fontWeight: '600', marginBottom: 6 },
    teamPlayer: { fontSize: 11.5, fontWeight: '600', lineHeight: 18 },
    console: { borderWidth: 1, borderRadius: 16, padding: 14, marginTop: 20 },
    consoleHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
    logLine: { fontSize: 11.5, fontWeight: '600', lineHeight: 17 },
});
