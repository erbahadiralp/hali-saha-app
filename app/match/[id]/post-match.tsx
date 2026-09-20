import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '../../../components/CustomAlertProvider';
import { Eyebrow, PrimaryButton, SecondaryButton, Segmented, Sheet, Stepper, TextField, compactName, toDate } from '../../../components/group/GroupUI';
import { SettingsScreen, useSettingsColors } from '../../../components/settings/SettingsUI';
import { withOpacity } from '../../../constants/designTokens';
import { useAuth } from '../../../context/AuthContext';
import { Dispute, fileDisputeObjection, getMatchDisputes, getPlayerDisputeCount, getPlayerDisputes, resolveDispute } from '../../../services/disputeService';
import { getGroupDetails, getMatchDetails, getMatchParticipants, isAdminOfGroup, updateMatchScore, updatePlayerStats } from '../../../services/firestore';
import { requestNotificationPermissions, scheduleVotingStartNotification } from '../../../services/notifications';

/** Layout: design/tasarım/macvar-screens-3.html (Maç Sonu & İstatistikler); colors from designTokens. */

type Stage = '1' | '2' | '3';

const FIELD_LABELS: Record<string, string> = { goals: 'Gol', assists: 'Asist', saves: 'Kurtarış' };

const validateStats = (scoreA: number, scoreB: number, myTeam: string | null, goals: number, assists: number) => {
    const teamScore = myTeam === 'A' ? scoreA : myTeam === 'B' ? scoreB : Math.max(scoreA, scoreB);
    const errors: string[] = [];
    if (goals > teamScore) errors.push(`Attığın gol sayısı (${goals}) takımının golünden (${teamScore}) fazla olamaz.`);
    if (assists > teamScore) errors.push(`Asist sayısı (${assists}) takımının golünden (${teamScore}) fazla olamaz.`);
    if (goals + assists > teamScore) errors.push(`Gol + asist toplamın (${goals + assists}) takım skorunu (${teamScore}) geçemez.`);
    return errors;
};

export default function PostMatchScreen() {
    const { alert } = useAlert();
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { user } = useAuth();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    const [stage, setStage] = useState<Stage>('1');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [scoreA, setScoreA] = useState('');
    const [scoreB, setScoreB] = useState('');
    const [myGoals, setMyGoals] = useState(0);
    const [myAssists, setMyAssists] = useState(0);
    const [mySaves, setMySaves] = useState(0);
    const [isGoalkeeper, setIsGoalkeeper] = useState(false);
    const [isAdmin, setIsAdmin] = useState(false);
    const [myTeam, setMyTeam] = useState<string | null>(null);
    const [matchDate, setMatchDate] = useState<Date | null>(null);
    const [teamNames, setTeamNames] = useState({ a: 'Takım A', b: 'Takım B' });
    const [allStats, setAllStats] = useState<any[]>([]);
    const [validationErrors, setValidationErrors] = useState<string[]>([]);

    const [myDisputes, setMyDisputes] = useState<Dispute[]>([]);
    const [adminDisputes, setAdminDisputes] = useState<Dispute[]>([]);
    const [disputeCount, setDisputeCount] = useState(0);
    const [disputeField, setDisputeField] = useState<string | null>(null);
    const [disputeMessage, setDisputeMessage] = useState('');
    const [disputeSubmitting, setDisputeSubmitting] = useState(false);

    const loadDisputes = async () => {
        if (!id || !user) return;
        try {
            const [playerDisputes, matchDisputes, count] = await Promise.all([
                getPlayerDisputes(user.uid),
                getMatchDisputes(id, user.uid),
                getPlayerDisputeCount(user.uid),
            ]);
            setMyDisputes(playerDisputes.filter(d => d.matchId === id));
            setAdminDisputes(matchDisputes);
            setDisputeCount(count);
        } catch (err) {
            console.error('Failed to load disputes:', err);
        }
    };

    const load = async () => {
        if (!id || !user) return;
        try {
            const matchData: any = await getMatchDetails(id);
            if (!matchData) return;
            const date = toDate(matchData.date);
            const finished = matchData.status === 'FINISHED';
            setMatchDate(date);
            setTeamNames({ a: matchData.customizations?.teamAName || 'Takım A', b: matchData.customizations?.teamBName || 'Takım B' });

            const parts: any[] = await getMatchParticipants(id);
            const me = parts.find(p => p.userId === user.uid);
            setAllStats(parts.filter(p => p.status === 'IN'));
            setMyTeam(me?.team || null);

            let admin = matchData.creatorId === user.uid;
            if (!admin && matchData.groupId) {
                const groupData: any = await getGroupDetails(matchData.groupId);
                admin = isAdminOfGroup(groupData, user.uid);
            }
            setIsAdmin(admin);

            if (finished) {
                if (matchData.scoreA !== undefined) setScoreA(String(matchData.scoreA));
                if (matchData.scoreB !== undefined) setScoreB(String(matchData.scoreB));
                if (me?.statsSubmitted) {
                    setMyGoals(me.goals || 0);
                    setMyAssists(me.assists || 0);
                    setStage('3');
                } else {
                    setStage('2');
                }
            }

            if (!admin && !finished && new Date() < date) {
                alert('Henüz Erken', 'Bu maça henüz istatistik girilemez.', [{ text: 'Tamam', onPress: () => router.back() }]);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id && user) {
            load();
            loadDisputes();
        }
    }, [id, user]);

    const sA = parseInt(scoreA, 10) || 0;
    const sB = parseInt(scoreB, 10) || 0;
    const myTeamScore = myTeam === 'A' ? sA : myTeam === 'B' ? sB : Math.max(sA, sB);
    const opponentScore = myTeam === 'A' ? sB : myTeam === 'B' ? sA : Math.min(sA, sB);

    const saveStats = async () => {
        if (!id || !user) return false;
        setSaving(true);
        try {
            if (isAdmin && scoreA && scoreB) await updateMatchScore(id, sA, sB);
            if (myTeam) {
                // Only the match entry is written; the server rebuilds profile totals from it.
                await updatePlayerStats(id, user.uid, myGoals, myAssists, isGoalkeeper ? opponentScore === 0 : undefined);
            }
            setAllStats((await getMatchParticipants(id)).filter((p: any) => p.status === 'IN'));
            return true;
        } catch (error) {
            console.error('Post-match save error:', error);
            alert('Hata', 'Kaydedilirken bir sorun oluştu. Lütfen tekrar dene.', [], { type: 'error' });
            return false;
        } finally {
            setSaving(false);
        }
    };

    const handleScoreNext = () => setStage('2');

    const handleStatsNext = async () => {
        if (myTeam) {
            const errors = validateStats(sA, sB, myTeam, myGoals, myAssists);
            if (errors.length) {
                setValidationErrors(errors);
                return;
            }
        }
        if (await saveStats()) setStage('3');
    };

    const finish = async () => {
        if (matchDate) {
            await requestNotificationPermissions();
            await scheduleVotingStartNotification(id, matchDate);
        }
        router.replace(`/match/${id}`);
    };

    const teamA = allStats.filter(p => p.team === 'A');
    const teamB = allStats.filter(p => p.team === 'B');
    const sum = (list: any[], key: string) => list.reduce((acc, p) => acc + (p[key] || 0), 0);

    const handleFinish = () => {
        if (isAdmin && (sum(teamA, 'goals') !== sA || sum(teamB, 'goals') !== sB)) {
            alert('Tutarsızlık Var', 'Oyuncuların girdiği goller maç skoruyla uyuşmuyor. Yine de bitirmek istiyor musun?', [
                { text: 'Kontrol Et', style: 'cancel' },
                { text: 'Yine de Bitir', style: 'destructive', onPress: finish },
            ], { type: 'warning' });
            return;
        }
        finish();
    };

    const handleFileDispute = async () => {
        if (!disputeMessage.trim() || !user || !disputeField) return;
        setDisputeSubmitting(true);
        try {
            const dispute = myDisputes.find(d => d.field === disputeField && d.status === 'open');
            if (!dispute?.id) {
                alert('Hata', 'Bu alan için aktif bir itiraz kaydı bulunamadı. Yöneticiyle iletişime geç.', [], { type: 'error' });
                return;
            }
            await fileDisputeObjection(dispute.id, user.uid, disputeMessage);
            setDisputeField(null);
            setDisputeMessage('');
            await loadDisputes();
            alert('İtiraz Gönderildi', 'Yönetici 48 saat içinde yanıtlayacak.', [], { type: 'success' });
        } catch (err: any) {
            alert('Hata', err.message || 'İtiraz gönderilemedi.', [], { type: 'error' });
        } finally {
            setDisputeSubmitting(false);
        }
    };

    const handleResolveDispute = async (disputeId: string, resolution: 'admin-accepted' | 'player-accepted') => {
        if (!user) return;
        try {
            await resolveDispute(disputeId, user.uid, resolution, resolution === 'player-accepted'
                ? 'Oyuncunun itirazı kabul edildi, istatistik eski haline getirildi.'
                : 'İstatistik değişikliği onaylandı.');
            await loadDisputes();
        } catch (err: any) {
            alert('Hata', err.message || 'İşlem başarısız.', [], { type: 'error' });
        }
    };

    /* ─────────────────────────── Stages ─────────────────────────── */

    const scoreBox = (label: string, color: string, value: string, onChange: (v: string) => void) => (
        <View style={st.scoreTeam}>
            <Text style={[st.scoreTeamName, { color }]} numberOfLines={1}>{label.toLocaleUpperCase('tr-TR')}</Text>
            <TextInput
                value={value}
                onChangeText={t => onChange(t.replace(/[^0-9]/g, '').slice(0, 2))}
                editable={isAdmin}
                keyboardType="number-pad"
                placeholder="0"
                placeholderTextColor={C.placeholder}
                style={[st.scoreInput, { backgroundColor: C.iconTile, borderColor: C.border, color: C.text }]}
            />
        </View>
    );

    const renderScore = () => (
        <>
            <View style={st.scoreRow}>
                {scoreBox(teamNames.a, C.teamA, scoreA, setScoreA)}
                <Text style={[st.scoreSep, { color: C.textTertiary }]}>—</Text>
                {scoreBox(teamNames.b, C.teamB, scoreB, setScoreB)}
            </View>
            {!isAdmin && (
                <View style={[st.note, { backgroundColor: C.card, borderColor: C.border }]}>
                    <Ionicons name="lock-closed-outline" size={16} color={C.textSecondary} />
                    <Text style={[st.noteText, { color: C.textSecondary }]}>Skoru sadece maç yöneticisi girebilir. Kendi istatistiklerine geçebilirsin.</Text>
                </View>
            )}
        </>
    );

    const statRow = (label: string, value: number, onChange: (v: number) => void, over?: boolean, last?: boolean) => (
        <View style={[st.statRow, { borderBottomColor: C.divider }, last && { borderBottomWidth: 0 }]}>
            <Text style={[st.statName, { color: over ? C.error : C.text }]}>{label}</Text>
            <Stepper value={value} onChange={onChange} />
        </View>
    );

    const renderPerformance = () => {
        if (!myTeam) {
            return (
                <View style={[st.note, { backgroundColor: C.card, borderColor: C.border, marginTop: 16 }]}>
                    <Ionicons name="football-outline" size={18} color={C.textSecondary} />
                    <Text style={[st.noteText, { color: C.textSecondary }]}>
                        Bu maçta kadroda yer almadığın için kendi istatistiğini giremezsin.{isAdmin ? ' Özete geçerek skoru kaydedebilirsin.' : ''}
                    </Text>
                </View>
            );
        }
        const errors = validateStats(sA, sB, myTeam, myGoals, myAssists);
        return (
            <>
                <Eyebrow style={{ marginTop: 18, marginBottom: 4 }}>
                    Bireysel Performans — {myTeam === 'A' ? teamNames.a : teamNames.b} ({myTeamScore} gol)
                </Eyebrow>
                <View style={[st.card, { backgroundColor: C.card, borderColor: C.border, paddingVertical: 4 }]}>
                    <TouchableOpacity onPress={() => setIsGoalkeeper(v => !v)} activeOpacity={0.7} style={[st.statRow, { borderBottomColor: C.divider }]}>
                        <Text style={[st.statName, { color: C.text }]}>Kaleci olarak oynadım</Text>
                        <Ionicons name={isGoalkeeper ? 'checkbox' : 'square-outline'} size={24} color={isGoalkeeper ? C.link : C.textTertiary} />
                    </TouchableOpacity>
                    {statRow('Gol', myGoals, setMyGoals, myGoals > myTeamScore)}
                    {statRow('Asist', myAssists, setMyAssists, myAssists > myTeamScore, !isGoalkeeper)}
                    {isGoalkeeper && statRow('Kurtarış', mySaves, setMySaves, false, true)}
                </View>

                {isGoalkeeper && opponentScore === 0 && (
                    <View style={[st.note, { backgroundColor: withOpacity(C.gold, 0.12), borderColor: withOpacity(C.gold, 0.35) }]}>
                        <Ionicons name="shield-checkmark" size={16} color={C.gold} />
                        <Text style={[st.noteText, { color: C.text }]}>Kalesini gol yemeden kapattın!</Text>
                    </View>
                )}

                <View style={[st.note, errors.length
                    ? { backgroundColor: withOpacity(C.error, 0.1), borderColor: withOpacity(C.error, 0.35) }
                    : { backgroundColor: C.card, borderColor: withOpacity(C.link, 0.5) }]}>
                    <Ionicons name={errors.length ? 'alert-circle' : 'checkmark'} size={16} color={errors.length ? C.error : C.link} />
                    <Text style={[st.noteText, { color: errors.length ? C.error : C.link, fontWeight: '700' }]}>
                        {errors.length ? errors[0] : 'Katkın takım skoruyla uyumlu'}
                    </Text>
                </View>
            </>
        );
    };

    const renderSummary = () => {
        const warnings: string[] = [];
        if (isAdmin) {
            if (sum(teamA, 'goals') !== sA) warnings.push(`${teamNames.a} golleri tutmuyor (girilen ${sum(teamA, 'goals')}, skor ${sA})`);
            if (sum(teamB, 'goals') !== sB) warnings.push(`${teamNames.b} golleri tutmuyor (girilen ${sum(teamB, 'goals')}, skor ${sB})`);
            if (sum(teamA, 'assists') > sA) warnings.push(`${teamNames.a} asistleri golden fazla`);
            if (sum(teamB, 'assists') > sB) warnings.push(`${teamNames.b} asistleri golden fazla`);
        }
        const openAdminDisputes = adminDisputes.filter(d => d.status === 'open' && d.playerMessage);

        const teamList = (players: any[], name: string, color: string) => (
            <View style={{ flex: 1 }}>
                <Text style={[st.teamTitle, { color }]} numberOfLines={1}>{name.toLocaleUpperCase('tr-TR')}</Text>
                {players.length === 0 ? <Text style={[st.muted, { color: C.textTertiary }]}>Veri yok</Text> : players.map((p, i) => (
                    <View key={p.userId || i} style={st.teamRow}>
                        <Text style={[st.teamName, { color: C.text }]} numberOfLines={1}>{compactName(p.name)}</Text>
                        <Text style={[st.teamStat, { color: p.goals || p.assists ? C.text : C.textTertiary }]}>
                            {p.goals || p.assists ? `${p.goals || 0}G ${p.assists || 0}A` : '–'}
                        </Text>
                    </View>
                ))}
            </View>
        );

        return (
            <View style={{ gap: 14, marginTop: 16 }}>
                <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                    <View style={[st.scoreRow, { marginVertical: 0, marginBottom: 14 }]}>
                        <View style={st.scoreTeam}>
                            <Text style={[st.scoreTeamName, { color: C.teamA }]} numberOfLines={1}>{teamNames.a}</Text>
                            <Text style={[st.scoreBig, { color: C.text }]}>{scoreA || '0'}</Text>
                        </View>
                        <Text style={[st.scoreSep, { color: C.textTertiary }]}>—</Text>
                        <View style={st.scoreTeam}>
                            <Text style={[st.scoreTeamName, { color: C.teamB }]} numberOfLines={1}>{teamNames.b}</Text>
                            <Text style={[st.scoreBig, { color: C.text }]}>{scoreB || '0'}</Text>
                        </View>
                    </View>
                    {(teamA.length > 0 || teamB.length > 0) && (
                        <View style={[st.teams, { borderTopColor: C.divider }]}>
                            {teamList(teamA, teamNames.a, C.teamA)}
                            {teamList(teamB, teamNames.b, C.teamB)}
                        </View>
                    )}
                </View>

                {warnings.length > 0 && (
                    <View style={[st.card, { backgroundColor: withOpacity(C.error, 0.08), borderColor: withOpacity(C.error, 0.3) }]}>
                        <View style={[st.rowCenter, { marginBottom: 6 }]}>
                            <Ionicons name="alert-circle-outline" size={18} color={C.error} />
                            <Text style={[st.cardTitle, { color: C.error }]}>Dikkat Edilmesi Gerekenler</Text>
                        </View>
                        {warnings.map(w => <Text key={w} style={[st.noteText, { color: C.error }]}>• {w}</Text>)}
                    </View>
                )}

                {myTeam && (
                    <View style={[st.card, { backgroundColor: C.card, borderColor: C.border, paddingVertical: 4 }]}>
                        {[
                            { field: 'goals', value: myGoals },
                            { field: 'assists', value: myAssists },
                            ...(isGoalkeeper ? [{ field: 'saves', value: mySaves }] : []),
                        ].map((s, i, arr) => {
                            const sent = myDisputes.some(d => d.field === s.field && d.status === 'open' && d.playerMessage);
                            const canDispute = myDisputes.some(d => d.field === s.field && d.status === 'open' && !d.playerMessage);
                            return (
                                <View key={s.field} style={[st.statRow, { borderBottomColor: C.divider }, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                                    <Text style={[st.statName, { color: C.textSecondary }]}>{FIELD_LABELS[s.field]}</Text>
                                    <View style={st.rowCenter}>
                                        {sent && <Text style={[st.tag, { color: C.gold, backgroundColor: withOpacity(C.gold, 0.15) }]}>İTİRAZ GÖNDERİLDİ</Text>}
                                        {canDispute && (
                                            <TouchableOpacity
                                                onPress={() => (disputeCount >= 3
                                                    ? alert('İtiraz Sınırı', 'Sezon başına en fazla 3 itiraz hakkın var.', [], { type: 'warning' })
                                                    : setDisputeField(s.field))}
                                                hitSlop={6}
                                            >
                                                <Text style={[st.tag, { color: C.error, backgroundColor: withOpacity(C.error, 0.12) }]}>İtiraz Et</Text>
                                            </TouchableOpacity>
                                        )}
                                        <Text style={[st.statValue, { color: C.text }]}>{s.value}</Text>
                                    </View>
                                </View>
                            );
                        })}
                    </View>
                )}

                {isAdmin && openAdminDisputes.length > 0 && (
                    <View style={[st.card, { backgroundColor: C.card, borderColor: withOpacity(C.error, 0.35) }]}>
                        <View style={[st.rowCenter, { marginBottom: 10 }]}>
                            <Ionicons name="hammer-outline" size={18} color={C.error} />
                            <Text style={[st.cardTitle, { color: C.error }]}>Açık İtirazlar ({openAdminDisputes.length})</Text>
                        </View>
                        {openAdminDisputes.map(d => (
                            <View key={d.id} style={[st.dispute, { borderTopColor: C.divider }]}>
                                <Text style={[st.muted, { color: C.textSecondary }]}>
                                    {FIELD_LABELS[d.field] || d.field}: {d.oldValue} → {d.newValue}
                                </Text>
                                <Text style={[st.quote, { color: C.text }]}>“{d.playerMessage}”</Text>
                                <View style={st.actions}>
                                    <SecondaryButton label="Kabul Et (Geri Al)" color={C.link} onPress={() => d.id && handleResolveDispute(d.id, 'player-accepted')} style={{ flex: 1, height: 40 }} />
                                    <SecondaryButton label="Reddet (Koru)" color={C.error} onPress={() => d.id && handleResolveDispute(d.id, 'admin-accepted')} style={{ flex: 1, height: 40 }} />
                                </View>
                            </View>
                        ))}
                    </View>
                )}

                <View style={[st.note, { backgroundColor: C.card, borderColor: C.border, marginTop: 0 }]}>
                    <Ionicons name="trophy-outline" size={16} color={C.gold} />
                    <Text style={[st.noteText, { color: C.textSecondary }]}>
                        MVP oylaması istatistik giriş süresi dolduktan sonra başlar; oyuncuya bildirim gönderilir.
                    </Text>
                </View>
            </View>
        );
    };

    const footer = () => {
        if (stage === '1') return <PrimaryButton label={isAdmin ? 'Skoru Onayla ve Devam Et' : 'Devam Et'} onPress={handleScoreNext} />;
        if (stage === '2') return <PrimaryButton label={myTeam ? 'Kaydet ve Devam Et' : 'Özete Geç'} onPress={handleStatsNext} disabled={saving} loading={saving ? <ActivityIndicator color={C.onPrimary} /> : undefined} />;
        return (
            <View style={st.actions}>
                <SecondaryButton label="Düzelt" icon="arrow-back" onPress={() => setStage('2')} style={{ flex: 1 }} />
                <PrimaryButton label={isAdmin ? 'Onayla ve Bitir' : 'Tamam'} onPress={handleFinish} style={{ flex: 2 }} />
            </View>
        );
    };

    if (loading) {
        return (
            <SettingsScreen title="Maç Sonu">
                <View style={st.center}><ActivityIndicator size="large" color={C.primaryText} /></View>
            </SettingsScreen>
        );
    }

    return (
        <SettingsScreen title="Maç Sonu">
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <View style={{ paddingHorizontal: 16 }}>
                    <Segmented<Stage>
                        options={[{ key: '1', label: '1. Skor' }, { key: '2', label: '2. Performans' }, { key: '3', label: '3. Özet' }]}
                        value={stage}
                        // Steps can be revisited, but not skipped ahead of saving.
                        onChange={next => { if (next < stage) setStage(next); }}
                    />
                </View>
                <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    {stage === '1' && renderScore()}
                    {stage === '2' && renderPerformance()}
                    {stage === '3' && renderSummary()}
                </ScrollView>
                <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12 }}>{footer()}</View>
            </KeyboardAvoidingView>

            <Sheet visible={validationErrors.length > 0} onClose={() => setValidationErrors([])} title="İstatistik Hatası">
                {validationErrors.map(e => (
                    <View key={e} style={[st.rowCenter, { alignItems: 'flex-start', marginBottom: 8 }]}>
                        <Ionicons name="close-circle" size={16} color={C.error} style={{ marginTop: 2 }} />
                        <Text style={[st.noteText, { color: C.text }]}>{e}</Text>
                    </View>
                ))}
                <PrimaryButton label="Düzelt" onPress={() => setValidationErrors([])} style={{ marginTop: 8 }} />
            </Sheet>

            <Sheet visible={!!disputeField} onClose={() => { setDisputeField(null); setDisputeMessage(''); }} title="İtiraz Et">
                <Text style={[st.noteText, { color: C.textSecondary, textAlign: 'center', marginBottom: 12 }]}>
                    “{disputeField ? FIELD_LABELS[disputeField] : ''}” istatistiğine itirazını yaz. Yönetici 48 saat içinde yanıtlayacak.
                </Text>
                <TextField
                    value={disputeMessage}
                    onChangeText={setDisputeMessage}
                    placeholder="Örn: 2 gol attım ama 1 yazıldı"
                    multiline
                    inputStyle={{ minHeight: 90, textAlignVertical: 'top' }}
                />
                <PrimaryButton
                    label="İtirazı Gönder"
                    onPress={handleFileDispute}
                    disabled={disputeSubmitting || !disputeMessage.trim()}
                    loading={disputeSubmitting ? <ActivityIndicator color={C.onPrimary} /> : undefined}
                    style={{ marginTop: 12 }}
                />
            </Sheet>
        </SettingsScreen>
    );
}

const st = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    rowCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    muted: { fontSize: 12, fontWeight: '500' },

    scoreRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18, marginVertical: 24 },
    scoreTeam: { flex: 1, alignItems: 'center' },
    scoreTeamName: { fontSize: 13, fontWeight: '800', marginBottom: 8 },
    scoreInput: { width: 84, height: 84, borderRadius: 20, borderWidth: 1.5, fontSize: 36, fontWeight: '800', textAlign: 'center' },
    scoreSep: { fontSize: 28, fontWeight: '800' },
    scoreBig: { fontSize: 34, fontWeight: '900' },

    note: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: 16, borderWidth: 1, padding: 12, marginTop: 12 },
    noteText: { flex: 1, fontSize: 12.5, lineHeight: 18 },

    card: { borderRadius: 20, borderWidth: 1, padding: 16 },
    cardTitle: { fontSize: 13.5, fontWeight: '800' },
    statRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 12, borderBottomWidth: 1 },
    statName: { fontSize: 14, fontWeight: '700' },
    statValue: { fontSize: 16, fontWeight: '800', minWidth: 20, textAlign: 'right' },
    tag: { fontSize: 10.5, fontWeight: '800', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, overflow: 'hidden' },

    teams: { flexDirection: 'row', gap: 16, borderTopWidth: 1, paddingTop: 12 },
    teamTitle: { fontSize: 12, fontWeight: '800', marginBottom: 6 },
    teamRow: { flexDirection: 'row', justifyContent: 'space-between', gap: 6, paddingVertical: 3 },
    teamName: { flex: 1, fontSize: 12.5, fontWeight: '600' },
    teamStat: { fontSize: 12, fontWeight: '800' },

    dispute: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 10, marginTop: 4 },
    quote: { fontSize: 13, fontStyle: 'italic', marginVertical: 8 },
    actions: { flexDirection: 'row', gap: 10 },
});
