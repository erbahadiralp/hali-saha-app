import { Ionicons } from '@expo/vector-icons';
import { differenceInMinutes } from 'date-fns';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '../../../components/CustomAlertProvider';
import { Avatar, Eyebrow, Pill, PrimaryButton, SecondaryButton, Sheet, StateView, compactName, toDate } from '../../../components/group/GroupUI';
import { MvpDuelCard } from '../../../components/MvpDuelCard';
import { SettingsScreen, useSettingsColors } from '../../../components/settings/SettingsUI';
import { withOpacity } from '../../../constants/designTokens';
import { useAuth } from '../../../context/AuthContext';
import { getGroupDetails, getMatchDetails, getMatchParticipants, isAdminOfGroup } from '../../../services/firestore';
import { getMvpSession, hasUserCompletedVoting, normalizePosition, recordMvpVote, saveMvpVotingSession, selectMvpCandidates, updateMvpCandidates } from '../../../services/mvp';
import { MatchAction, MvpCandidate } from '../../../services/mvpLogic';
import { requestNotificationPermissions, scheduleVotingEndNotification } from '../../../services/notifications';

/** Layout: design/tasarım/macvar-screens-3.html (MVP Oylaması); colors from designTokens. */

const POSITIONS: Record<string, string> = { FW: 'Forvet', MF: 'Orta Saha', DF: 'Defans', GK: 'Kaleci' };
// Voting opens after the 10-minute stats window and closes 31 minutes after the match ends.
const OPENS_AFTER_MIN = 10;
const CLOSES_AFTER_MIN = 31;

type VotingStatus = 'loading' | 'too_early' | 'active' | 'closed' | 'no_data' | 'results_view' | 'already_voted';
type Side = 'king' | 'challenger';

interface VotingState {
    candidates: MvpCandidate[];
    queue: MvpCandidate[];
    king: MvpCandidate | null;
    challenger: MvpCandidate | null;
    round: number;
    totalRounds: number;
    winner: MvpCandidate | null;
}

const EMPTY_STATE: VotingState = { candidates: [], queue: [], king: null, challenger: null, round: 1, totalRounds: 0, winner: null };

export default function MvpVoteScreen() {
    const { alert } = useAlert();
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { user } = useAuth();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(true);
    const [voting, setVoting] = useState(false);
    const [status, setStatus] = useState<VotingStatus>('loading');
    const [minutesLeft, setMinutesLeft] = useState(0);
    const [isAdmin, setIsAdmin] = useState(false);
    const [showJoker, setShowJoker] = useState(false);
    const [allParticipants, setAllParticipants] = useState<any[]>([]);
    const [state, setState] = useState<VotingState>(EMPTY_STATE);
    const [choice, setChoice] = useState<Side | null>(null);

    const initializeVoting = (candidates: MvpCandidate[]) => {
        if (candidates.length < 2) return;
        const shuffled = [...candidates].sort(() => Math.random() - 0.5);
        setState({ candidates, king: shuffled[0], challenger: shuffled[1], queue: shuffled.slice(2), round: 1, totalRounds: candidates.length - 1, winner: null });
        setChoice(null);
    };

    const loadVotingSession = async () => {
        try {
            if (!id || !user) return;
            const matchData: any = await getMatchDetails(id);
            if (!matchData) {
                setStatus('no_data');
                return;
            }

            let admin = matchData.creatorId === user.uid;
            if (!admin && matchData.groupId) {
                const groupData: any = await getGroupDetails(matchData.groupId);
                admin = isAdminOfGroup(groupData, user.uid);
            }
            setIsAdmin(admin);

            const matchDate = toDate(matchData.date);
            const matchEnd = matchData.finishedAt ? toDate(matchData.finishedAt) : new Date(matchDate.getTime() + 90 * 60 * 1000);
            const sinceEnd = differenceInMinutes(new Date(), matchEnd);

            const participants: any[] = await getMatchParticipants(id);
            const scoreA = matchData.scoreA || 0;
            const scoreB = matchData.scoreB || 0;
            const winningTeam: 'A' | 'B' | 'draw' = scoreA > scoreB ? 'A' : scoreB > scoreA ? 'B' : 'draw';
            const players = participants.filter(p => p.status === 'IN').map(p => {
                const actions: MatchAction = {
                    goals: p.goals || 0,
                    assists: p.assists || 0,
                    cleanSheet: p.cleanSheet || false,
                    saves: p.saves || 0,
                    penaltySaves: 0,
                    ownGoals: 0,
                    cards: 0,
                    teamWon: p.team === winningTeam,
                };
                return {
                    userId: p.userId,
                    displayName: p.name || 'Oyuncu',
                    photoURL: p.photoURL || null,
                    position: normalizePosition(p.position),
                    team: (p.team || 'A') as 'A' | 'B',
                    actions,
                    mvpScore: 0,
                };
            });
            setAllParticipants(players);

            if (sinceEnd < OPENS_AFTER_MIN && !admin) {
                setMinutesLeft(OPENS_AFTER_MIN - sinceEnd);
                setStatus('too_early');
                return;
            }
            if (sinceEnd > CLOSES_AFTER_MIN) {
                setStatus('closed');
                return;
            }

            const session = await getMvpSession(id);
            if (session?.isComplete) {
                setStatus('closed');
                return;
            }
            if (await hasUserCompletedVoting(id, user.uid)) {
                setStatus('already_voted');
                return;
            }

            if (!session) {
                const valid = players.filter(p => p.team === 'A' || p.team === 'B');
                if (valid.length < 2) {
                    setStatus('no_data');
                    return;
                }
                const candidates = selectMvpCandidates(valid, winningTeam);
                await saveMvpVotingSession(id, candidates);
                initializeVoting(candidates);
            } else {
                initializeVoting(session.candidates);
            }

            setMinutesLeft(Math.max(0, CLOSES_AFTER_MIN - sinceEnd));
            setStatus('active');
            await requestNotificationPermissions();
            await scheduleVotingEndNotification(id, matchDate);
        } catch (error) {
            console.error('Error loading session:', error);
            setStatus('no_data');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadVotingSession();
    }, [id]);

    const handleVote = async () => {
        if (!choice || voting || !state.king || !state.challenger || !user) return;
        setVoting(true);
        const winner = choice === 'king' ? state.king : state.challenger;
        try {
            await recordMvpVote(id, state.king.odaylarId, state.challenger.odaylarId, winner.odaylarId, user.uid);
            // Brief pause so the pick registers visually before the next duel.
            setTimeout(() => {
                if (state.queue.length > 0) {
                    setState(prev => ({ ...prev, king: winner, challenger: prev.queue[0], queue: prev.queue.slice(1), round: prev.round + 1 }));
                    setChoice(null);
                } else {
                    setStatus('already_voted');
                }
                setVoting(false);
            }, 450);
        } catch (error) {
            console.error('Error voting:', error);
            setVoting(false);
            alert('Hata', 'Oyun kaydedilemedi, tekrar dene.', [], { type: 'error' });
        }
    };

    const handleJokerUpdate = async (player: any) => {
        try {
            setShowJoker(false);
            setLoading(true);
            const candidates = [...state.candidates];
            const joker: MvpCandidate = {
                odaylarId: player.userId,
                displayName: player.displayName,
                photoURL: player.photoURL,
                position: player.position,
                team: player.team,
                mvpScore: player.mvpScore || 0,
                isJoker: true,
                stats: player.actions,
            };
            // The fifth slot is reserved for the admin's joker pick.
            if (candidates.length >= 5) candidates[4] = joker;
            else candidates.push(joker);
            await updateMvpCandidates(id, candidates);
            await loadVotingSession();
            alert('Güncellendi', 'Joker aday güncellendi.', [], { type: 'success' });
        } catch (error) {
            console.error('Error updating joker:', error);
            alert('Hata', 'Aday güncellenemedi.', [], { type: 'error' });
            setLoading(false);
        }
    };

    const showResults = async () => {
        setLoading(true);
        try {
            const { getMvpResults } = await import('../../../services/mvp');
            const results = await getMvpResults(id);
            const session = await getMvpSession(id);
            const pool = state.candidates.length ? state.candidates : session?.candidates || [];
            const winner = results.length ? pool.find(c => c.odaylarId === results[0].odaylarId) : null;
            if (winner) {
                setState(prev => ({ ...prev, winner }));
                setStatus('results_view');
            } else {
                alert('Sonuçlar', 'Henüz yeterli oy kullanılmadı.', [], { type: 'info' });
            }
        } finally {
            setLoading(false);
        }
    };

    const confirmClose = () => {
        alert('Oylamayı Bitir', 'Oylamayı şimdi bitirmek istediğine emin misin?', [
            { text: 'Vazgeç', style: 'cancel' },
            {
                text: 'Bitir',
                style: 'destructive',
                onPress: async () => {
                    setLoading(true);
                    const { closeVotingSession } = await import('../../../services/mvp');
                    await closeVotingSession(id);
                    setStatus('closed');
                    setLoading(false);
                },
            },
        ], { type: 'warning' });
    };

    /* ─────────────────────────── States ─────────────────────────── */

    const adminActions = isAdmin && status === 'active' ? (
        <View style={st.headerActions}>
            {__DEV__ && (
                <TouchableOpacity
                    onPress={async () => {
                        const { simulateMvpVotes } = await import('../../../services/mvpDebug');
                        await simulateMvpVotes(id, state.candidates, 5, user?.uid || 'unknown');
                        alert('Simülasyon', '5 kullanıcıdan otomatik oy eklendi.');
                    }}
                    style={[st.iconBtn, { backgroundColor: C.card, borderColor: C.border }]}
                >
                    <Ionicons name="bug-outline" size={18} color={C.warning} />
                </TouchableOpacity>
            )}
            <TouchableOpacity onPress={() => setShowJoker(true)} style={[st.iconBtn, { backgroundColor: C.card, borderColor: C.border }]} accessibilityLabel="Joker aday seç">
                <Ionicons name="create-outline" size={18} color={C.text} />
            </TouchableOpacity>
            <TouchableOpacity onPress={confirmClose} style={[st.iconBtn, { backgroundColor: withOpacity(C.error, 0.12), borderColor: withOpacity(C.error, 0.35) }]} accessibilityLabel="Oylamayı bitir">
                <Ionicons name="stop" size={16} color={C.error} />
            </TouchableOpacity>
        </View>
    ) : undefined;

    const body = () => {
        if (loading || status === 'loading') {
            return (
                <View style={st.center}>
                    <ActivityIndicator size="large" color={C.primaryText} />
                    <Text style={[st.loadingText, { color: C.textSecondary }]}>Adaylar hazırlanıyor…</Text>
                </View>
            );
        }
        if (status === 'too_early') {
            return (
                <StateView icon="hourglass-outline" color={C.gold} title="Henüz Erken" text="MVP oylaması istatistik giriş süresi dolunca başlayacak.">
                    <View style={[st.timerBox, { backgroundColor: C.card, borderColor: C.border }]}>
                        <Eyebrow>Kalan Süre</Eyebrow>
                        <Text style={[st.timer, { color: C.link }]}>{minutesLeft} dk</Text>
                    </View>
                    <SecondaryButton label="Geri Dön" onPress={() => router.back()} />
                </StateView>
            );
        }
        if (status === 'closed') {
            return (
                <StateView icon="lock-closed-outline" color={C.error} title="Oylama Kapandı" text="Bu maç için MVP oylaması sona erdi.">
                    <PrimaryButton label="Sonuçları Gör" icon="trophy-outline" onPress={showResults} />
                    <SecondaryButton label="Geri Dön" onPress={() => router.back()} />
                </StateView>
            );
        }
        if (status === 'no_data') {
            return (
                <StateView icon="stats-chart-outline" title="Veri Bulunamadı" text="MVP adaylarını belirlemek için yeterli istatistik yok.">
                    <SecondaryButton label="Geri Dön" onPress={() => router.back()} />
                </StateView>
            );
        }
        if (status === 'already_voted') {
            return (
                <StateView icon="checkmark-done" color={C.link} title="Oyun Kaydedildi" text="Katıldığın için teşekkürler. Sonuçlar oylama bitince açıklanacak.">
                    <SecondaryButton label="Maça Dön" onPress={() => router.back()} />
                </StateView>
            );
        }
        if (status === 'results_view' && state.winner) {
            const w = state.winner;
            return (
                <View style={st.center}>
                    <Pill label="MAÇIN ADAMI" color={C.gold} icon="trophy" />
                    <View style={[st.winnerRing, { borderColor: C.gold }]}>
                        <Avatar uri={w.photoURL || undefined} name={w.displayName} size={132} radius={40} />
                    </View>
                    <Text style={[st.winnerName, { color: C.text }]}>{w.displayName}</Text>
                    <Text style={[st.winnerMeta, { color: C.textSecondary }]}>
                        {POSITIONS[w.position] || w.position} · {w.team === 'A' ? 'Takım A' : 'Takım B'}
                    </Text>
                    <Text style={[st.winnerStats, { color: C.textSecondary }]}>{w.stats.goals} Gol · {w.stats.assists} Asist</Text>
                    <PrimaryButton label="Tamam" onPress={() => router.back()} style={{ alignSelf: 'stretch', marginTop: 28 }} />
                </View>
            );
        }

        const picked = choice === 'king' ? state.king : choice === 'challenger' ? state.challenger : null;
        const cardState = (side: Side) => (choice === side ? 'selected' : choice ? 'lost' : 'idle');
        const next = state.queue[0];

        return (
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
                <View style={st.pills}>
                    <Pill label={`Oylamaya ${minutesLeft} dk kaldı`} color={C.gold} icon="timer-outline" />
                    <Pill label={`Tur ${state.round} / ${state.totalRounds}`} />
                </View>
                <View style={[st.progress, { backgroundColor: C.iconTile }]}>
                    <View style={[st.progressFill, { width: `${(state.round / Math.max(1, state.totalRounds)) * 100}%`, backgroundColor: C.link }]} />
                </View>

                <Text style={[st.question, { color: C.textSecondary }]}>{"Sence maçın MVP'si kim?"}</Text>

                <View style={st.duel}>
                    {state.king && (
                        <MvpDuelCard key={`king-${state.king.odaylarId}`} candidate={state.king} allCandidates={state.candidates} onSelect={() => setChoice('king')} state={cardState('king')} side="left" disabled={voting} />
                    )}
                    <Text style={[st.vs, { color: C.textTertiary }]}>VS</Text>
                    {state.challenger && (
                        <MvpDuelCard key={`challenger-${state.challenger.odaylarId}`} candidate={state.challenger} allCandidates={state.candidates} onSelect={() => setChoice('challenger')} state={cardState('challenger')} side="right" disabled={voting} />
                    )}
                </View>

                <PrimaryButton
                    label={picked ? `${compactName(picked.displayName)} için Oy Ver` : 'Bir aday seç'}
                    onPress={handleVote}
                    disabled={!picked || voting}
                    loading={voting ? <ActivityIndicator color={C.onPrimary} /> : undefined}
                />

                <Eyebrow style={{ marginTop: 24, marginBottom: 10 }}>Tüm Adaylar</Eyebrow>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 14 }}>
                    {state.candidates.map(c => {
                        const inDuel = c.odaylarId === state.king?.odaylarId || c.odaylarId === state.challenger?.odaylarId;
                        return (
                            <View key={c.odaylarId} style={[st.cand, !inDuel && st.candDim]}>
                                <View style={inDuel ? [st.candRing, { borderColor: C.link }] : undefined}>
                                    <Avatar uri={c.photoURL || undefined} name={c.displayName} size={40} />
                                </View>
                                <Text style={[st.candName, { color: C.textSecondary }]} numberOfLines={1}>
                                    {c.isJoker ? 'Joker' : compactName(c.displayName)}
                                </Text>
                            </View>
                        );
                    })}
                </ScrollView>

                <View style={[st.info, { backgroundColor: C.card, borderColor: C.border }]}>
                    <Text style={[st.infoText, { color: C.textSecondary }]}>
                        Seçtiğin aday bir sonraki düelloda kalır, diğeri elenir. Toplam {state.candidates.length} aday arasından tek kazanan taçlandırılır.
                        {next ? ` Sıradaki rakip: ${compactName(next.displayName)}.` : ' Bu final düellosu.'}
                    </Text>
                </View>
            </ScrollView>
        );
    };

    return (
        <SettingsScreen title="MVP Oylaması" headerRight={adminActions}>
            {body()}

            <Sheet visible={showJoker} onClose={() => setShowJoker(false)} title="Joker Adayı Seç">
                <ScrollView style={{ flexShrink: 1 }} showsVerticalScrollIndicator={false}>
                    {allParticipants.filter(p => !state.candidates.some(c => c.odaylarId === p.userId)).map((p, i, arr) => (
                        <TouchableOpacity
                            key={p.userId}
                            onPress={() => handleJokerUpdate(p)}
                            activeOpacity={0.7}
                            style={[st.jokerRow, { borderBottomColor: C.divider }, i === arr.length - 1 && { borderBottomWidth: 0 }]}
                        >
                            <Avatar uri={p.photoURL || undefined} name={p.displayName} size={40} />
                            <View style={{ flex: 1 }}>
                                <Text style={[st.jokerName, { color: C.text }]} numberOfLines={1}>{p.displayName}</Text>
                                <Text style={[st.jokerMeta, { color: C.textSecondary }]}>
                                    {p.team === 'A' ? 'Takım A' : 'Takım B'} · {POSITIONS[p.position] || p.position}
                                </Text>
                            </View>
                            {p.actions.goals > 0 && <Pill label={`${p.actions.goals} Gol`} color={C.link} />}
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </Sheet>
        </SettingsScreen>
    );
}

const st = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
    loadingText: { marginTop: 12, fontSize: 13, fontWeight: '600' },
    headerActions: { flexDirection: 'row', gap: 8 },
    iconBtn: { width: 38, height: 38, borderRadius: 19, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

    timerBox: { borderRadius: 16, borderWidth: 1, padding: 14, alignItems: 'center' },
    timer: { fontSize: 28, fontWeight: '800', marginTop: 4 },

    pills: { flexDirection: 'row', justifyContent: 'center', gap: 8 },
    progress: { height: 4, borderRadius: 2, marginTop: 12, overflow: 'hidden' },
    progressFill: { height: '100%', borderRadius: 2 },
    question: { textAlign: 'center', fontSize: 13, fontWeight: '600', marginTop: 20 },
    duel: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 16 },
    vs: { fontSize: 13, fontWeight: '800' },

    cand: { alignItems: 'center', gap: 5, width: 60 },
    candDim: { opacity: 0.5 },
    candRing: { borderWidth: 2, borderRadius: 24, padding: 2 },
    candName: { fontSize: 10, fontWeight: '700' },

    info: { borderRadius: 20, borderWidth: 1, padding: 16, marginTop: 20 },
    infoText: { fontSize: 12, fontWeight: '600', lineHeight: 18 },

    winnerRing: { borderWidth: 4, borderRadius: 46, padding: 4, marginTop: 20 },
    winnerName: { fontSize: 26, fontWeight: '900', marginTop: 16, textAlign: 'center' },
    winnerMeta: { fontSize: 12.5, fontWeight: '700', marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    winnerStats: { fontSize: 13, fontWeight: '600', marginTop: 6 },

    jokerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
    jokerName: { fontSize: 14.5, fontWeight: '700' },
    jokerMeta: { fontSize: 12, marginTop: 2 },
});
