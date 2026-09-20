import { addDoc, arrayRemove, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { auth, db } from '../../firebaseConfig';
import { getGroupDetails, getGroupRequests, joinGroup, requestToJoinGroup, respondToGroupRequest } from '../groupService';
import {
    deleteMatch,
    getMatchDetails,
    getMatchParticipants,
    isMatchFullError,
    joinMatch,
    updateMatch,
    updateMatchScore,
    updatePlayerStats,
} from '../matchService';
import { closeVotingSession, getMvpSession, hasUserCompletedVoting, recordMvpVote, saveMvpVotingSession, selectMvpCandidates } from '../mvp';
import { MatchAction, MvpCandidate, normalizePosition } from '../mvpLogic';
import { matchRating } from '../playerStats';
import { getUserProfile } from '../userService';
import { BOTS, BotSeed, asBot, ensureBot } from './bots';

/**
 * Test Lab scenarios. Each step is performed by the party that does it in real life:
 * bots join, leave, enter stats and vote as themselves; the signed-in user acts as the organizer.
 */

export type Log = (line: string) => void;
/** bot key -> uid */
export type BotUids = Record<string, string>;

const MATCH_MINUTES = 90;
const pause = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
const shuffle = <T,>(list: T[]) => [...list].sort(() => Math.random() - 0.5);
const botForUid = (uids: BotUids, uid: string) => BOTS.find(b => uids[b.key] === uid);

function pickWeighted<T>(items: T[], weight: (item: T) => number): T | null {
    const total = items.reduce((sum, item) => sum + Math.max(0, weight(item)), 0);
    if (total <= 0) return null;
    let roll = Math.random() * total;
    for (const item of items) {
        roll -= Math.max(0, weight(item));
        if (roll <= 0) return item;
    }
    return items[items.length - 1];
}

/* ─────────────────────────── Bots & group ─────────────────────────── */

export async function prepareBots(log: Log): Promise<BotUids> {
    const uids: BotUids = {};
    for (const bot of BOTS) {
        uids[bot.key] = await ensureBot(bot);
        log(`✓ ${bot.name} hazır (${bot.position}, seviye ${bot.skillLevel})`);
    }
    return uids;
}

/** Public groups: bots join themselves. Private groups: bots request, the organizer approves. */
export async function botsJoinGroup(groupId: string, uids: BotUids, log: Log) {
    const group: any = await getGroupDetails(groupId);
    if (!group) throw new Error('Grup bulunamadı');
    const members: string[] = group.members || [];
    const outside = BOTS.filter(b => uids[b.key] && !members.includes(uids[b.key]));
    if (outside.length === 0) {
        log('Tüm botlar zaten grupta.');
        return;
    }

    if (group.privacy !== 'private') {
        for (const bot of outside) {
            await asBot(bot, ({ uid, db: botDb }) => joinGroup(groupId, uid, { firestore: botDb }));
            log(`✓ ${bot.name} gruba katıldı`);
        }
        return;
    }

    for (const bot of outside) {
        await asBot(bot, ({ uid, db: botDb }) => requestToJoinGroup(groupId, uid, { firestore: botDb }));
        log(`→ ${bot.name} katılım isteği gönderdi`);
    }
    const botUids = new Set(outside.map(b => uids[b.key]));
    const requests = (await getGroupRequests(groupId)).filter((r: any) => botUids.has(r.userId));
    for (const request of requests as any[]) {
        await respondToGroupRequest(request.id, groupId, request.userId, 'approve');
        log(`✓ İstek onaylandı: ${botForUid(uids, request.userId)?.name ?? request.userId}`);
    }
}

/** The organizer sets each bot's group level and archetype, as in Oyuncu Güçleri. */
export async function assignBotLevels(groupId: string, uids: BotUids, log: Log) {
    const group: any = await getGroupDetails(groupId);
    if (!group) throw new Error('Grup bulunamadı');
    const members: string[] = group.members || [];
    const inGroup = BOTS.filter(b => members.includes(uids[b.key]));
    if (inGroup.length === 0) throw new Error('Önce botları gruba ekle.');

    const details: any[] = (group.memberDetails || []).filter((m: any) => !inGroup.some(b => uids[b.key] === m.uid));
    const ratings: Record<string, number> = {};
    inGroup.forEach(bot => {
        details.push({ uid: uids[bot.key], skillLevel: bot.skillLevel, archetype: bot.archetype });
        ratings[`memberRatings.${uids[bot.key]}`] = Math.min(99, Math.max(40, Math.round(bot.skillLevel * 6 + 40)));
    });
    // One write, so the overall recalculation trigger runs once per changed rating instead of per save.
    await updateDoc(doc(db, 'groups', groupId), { memberDetails: details, ...ratings });
    log(`✓ ${inGroup.length} botun seviyesi ve arketipi atandı`);
}

/* ─────────────────────────── Match lifecycle ─────────────────────────── */

export async function createTestMatch(groupId: string, maxPlayers: number, log: Log): Promise<string> {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Oturum bulunamadı');
    const date = new Date(Date.now() + 3 * 60 * 60 * 1000);
    const ref = await addDoc(collection(db, 'matches'), {
        groupId,
        venue: 'Test Lab Halısaha',
        date,
        feePerPerson: 150,
        status: 'UPCOMING',
        playerCount: 0,
        maxPlayers,
        creatorId: uid,
        isTestMatch: true,
        createdAt: serverTimestamp(),
    });
    log(`✓ Test maçı oluşturuldu (${maxPlayers} kişilik, 3 saat sonra)`);
    return ref.id;
}

export async function botsJoinMatch(matchId: string, uids: BotUids, count: number, log: Log) {
    const participants: any[] = await getMatchParticipants(matchId);
    const already = new Set(participants.filter(p => p.status === 'IN' || p.status === 'WAITLIST').map(p => p.userId));
    const candidates = shuffle(BOTS.filter(b => uids[b.key] && !already.has(uids[b.key]))).slice(0, count);
    if (candidates.length === 0) {
        log('Katılacak bot kalmadı.');
        return;
    }
    for (const bot of candidates) {
        await asBot(bot, async ({ uid, db: botDb }) => {
            try {
                await joinMatch(matchId, uid, bot.name, 'IN', { firestore: botDb });
                log(`✓ ${bot.name} kadroya girdi`);
            } catch (error) {
                if (!isMatchFullError(error)) throw error;
                await joinMatch(matchId, uid, bot.name, 'WAITLIST', { firestore: botDb });
                log(`… ${bot.name} maç dolu, yedeğe geçti`);
            }
        });
    }
}

/** A random bot drops out; the waitlist promotion runs from the bot's session. */
export async function botLeavesMatch(matchId: string, uids: BotUids, log: Log) {
    const participants: any[] = await getMatchParticipants(matchId);
    const inBots = participants.filter(p => p.status === 'IN' && botForUid(uids, p.userId));
    if (inBots.length === 0) throw new Error('Kadroda bot yok.');
    const leaver = inBots[Math.floor(Math.random() * inBots.length)];
    const bot = botForUid(uids, leaver.userId) as BotSeed;
    const waitingBefore = new Set(participants.filter(p => p.status === 'WAITLIST').map(p => p.userId));

    await asBot(bot, ({ uid, db: botDb }) => joinMatch(matchId, uid, bot.name, 'OUT', { firestore: botDb }));
    log(`← ${bot.name} maçtan çıktı`);

    const after: any[] = await getMatchParticipants(matchId);
    const promoted = after.find(p => p.status === 'IN' && waitingBefore.has(p.userId));
    const match: any = await getMatchDetails(matchId);
    log(promoted ? `✓ Yedekten ${promoted.name} kadroya alındı` : 'Yedekte kimse yoktu, yer boş kaldı.');
    log(`Kadro sayacı: ${match?.playerCount ?? '?'} / ${match?.maxPlayers ?? '?'} (kayıtlı IN: ${after.filter(p => p.status === 'IN').length})`);
}

/** Moves the kick-off into the past so the match "just ended" `minutesAgo` minutes ago. */
export async function warpMatchToEnded(matchId: string, minutesAgo: number, log: Log) {
    const date = new Date(Date.now() - (MATCH_MINUTES + minutesAgo) * 60 * 1000);
    await updateMatch(matchId, { date });
    log(`✓ Maç ${minutesAgo} dakika önce bitmiş gibi ayarlandı (MVP oylaması 10.–31. dakikalar arası açık)`);
}

export async function finishMatch(matchId: string, scoreA: number, scoreB: number, log: Log) {
    const participants: any[] = await getMatchParticipants(matchId);
    const withTeam = participants.filter(p => p.status === 'IN' && (p.team === 'A' || p.team === 'B'));
    if (withTeam.length < 2) throw new Error('Önce Kadro Kurucu’da takımları kaydet.');
    await updateMatchScore(matchId, scoreA, scoreB);
    log(`✓ Skor kaydedildi: ${scoreA} - ${scoreB} (maç bitti)`);
}

// Who scores and assists: forwards score most, midfielders assist most; better players a bit more.
const GOAL_WEIGHT: Record<string, number> = { FW: 6, MF: 3, DF: 1, GK: 0.05 };
const ASSIST_WEIGHT: Record<string, number> = { FW: 3, MF: 5, DF: 1.5, GK: 0.2 };

export async function botsEnterStats(matchId: string, uids: BotUids, log: Log) {
    const match: any = await getMatchDetails(matchId);
    if (!match || match.status !== 'FINISHED') throw new Error('Önce skoru girip maçı bitir.');
    const participants: any[] = ((await getMatchParticipants(matchId)) as any[]).filter(p => p.status === 'IN' && (p.team === 'A' || p.team === 'B'));
    const skillOf = (p: any) => botForUid(uids, p.userId)?.skillLevel ?? 5;
    const lines = new Map<string, { goals: number; assists: number }>();
    participants.forEach(p => lines.set(p.userId, { goals: 0, assists: 0 }));

    (['A', 'B'] as const).forEach(team => {
        const players = participants.filter(p => p.team === team);
        const goals = team === 'A' ? match.scoreA || 0 : match.scoreB || 0;
        for (let i = 0; i < goals; i++) {
            const scorer = pickWeighted(players, p => GOAL_WEIGHT[normalizePosition(p.position)] * (0.5 + skillOf(p) / 10));
            if (!scorer) continue;
            lines.get(scorer.userId)!.goals++;
            if (Math.random() < 0.7) {
                const assister = pickWeighted(players.filter(p => p.userId !== scorer.userId), p => ASSIST_WEIGHT[normalizePosition(p.position)] * (0.5 + skillOf(p) / 10));
                if (assister) lines.get(assister.userId)!.assists++;
            }
        }
    });

    let humans = 0;
    for (const p of participants) {
        const bot = botForUid(uids, p.userId);
        if (!bot) {
            humans++;
            continue;
        }
        const line = lines.get(p.userId)!;
        const conceded = p.team === 'A' ? match.scoreB || 0 : match.scoreA || 0;
        const isKeeper = normalizePosition(p.position) === 'GK';
        await asBot(bot, ({ uid, db: botDb }) =>
            updatePlayerStats(matchId, uid, line.goals, line.assists, isKeeper ? conceded === 0 : undefined, { firestore: botDb })
        );
        if (line.goals || line.assists) log(`✓ ${bot.name}: ${line.goals} gol, ${line.assists} asist`);
    }
    log(`✓ Botlar istatistiklerini girdi${humans ? ` (${humans} gerçek oyuncu kendi girecek)` : ''}`);
}

export async function botsVoteMvp(matchId: string, uids: BotUids, log: Log) {
    const match: any = await getMatchDetails(matchId);
    if (!match || match.status !== 'FINISHED') throw new Error('Önce maçı bitir ve istatistikleri gir.');
    const participants: any[] = ((await getMatchParticipants(matchId)) as any[]).filter(p => p.status === 'IN' && (p.team === 'A' || p.team === 'B'));
    const voters = participants.map(p => ({ p, bot: botForUid(uids, p.userId) })).filter(v => v.bot) as { p: any; bot: BotSeed }[];
    if (voters.length === 0) throw new Error('Maçta oynayan bot yok.');

    let session = await getMvpSession(matchId);
    if (session?.isComplete) throw new Error('Oylama kapanmış.');
    if (!session) {
        // Same candidate selection as the MVP screen; the first voting bot opens the session.
        const winningTeam: 'A' | 'B' | 'draw' = match.scoreA > match.scoreB ? 'A' : match.scoreB > match.scoreA ? 'B' : 'draw';
        const players = participants.map(p => ({
            userId: p.userId,
            displayName: p.name || 'Oyuncu',
            photoURL: p.photoURL || undefined,
            position: normalizePosition(p.position),
            team: p.team as 'A' | 'B',
            actions: {
                goals: p.goals || 0, assists: p.assists || 0, cleanSheet: p.cleanSheet || false, saves: p.saves || 0,
                penaltySaves: 0, ownGoals: 0, cards: 0, teamWon: p.team === winningTeam,
            } as MatchAction,
        }));
        const candidates = selectMvpCandidates(players, winningTeam);
        await asBot(voters[0].bot, ({ db: botDb }) => saveMvpVotingSession(matchId, candidates, { firestore: botDb }));
        session = await getMvpSession(matchId);
        log(`✓ Oylama açıldı: ${candidates.map(c => c.displayName).join(', ')}`);
    }
    const candidates: MvpCandidate[] = session?.candidates || [];
    if (candidates.length < 2) throw new Error('Yeterli aday yok.');

    // Stronger performances win duels more often, but not always.
    const strength = (c: MvpCandidate) => Math.pow((c.mvpScore || 0) + 5, 1.6);
    for (const { bot } of voters) {
        const uid = uids[bot.key];
        if (await hasUserCompletedVoting(matchId, uid)) continue;
        const bracket = shuffle(candidates);
        let king = bracket[0];
        await asBot(bot, async ({ db: botDb }) => {
            for (const challenger of bracket.slice(1)) {
                const kingWins = Math.random() < strength(king) / (strength(king) + strength(challenger));
                const winner = kingWins ? king : challenger;
                await recordMvpVote(matchId, king.odaylarId, challenger.odaylarId, winner.odaylarId, uid, { firestore: botDb });
                king = winner;
            }
        });
        log(`🗳 ${bot.name} → ${king.displayName}`);
        await pause(50);
    }
}

export async function closeMvpVoting(matchId: string, log: Log) {
    await closeVotingSession(matchId);
    const updated: any = await getMatchDetails(matchId);
    const winner = updated?.motm ? (await getUserProfile(updated.motm) as any)?.displayName : null;
    log(winner ? `🏆 MVP: ${winner}` : 'Oylama kapandı ama oy yoktu.');
}

/* ─────────────────────────── Balance report ─────────────────────────── */

export interface TeamSummary {
    count: number;
    average: number;
    total: number;
    positions: Record<'GK' | 'DF' | 'MF' | 'FW', number>;
    players: { name: string; rating: number; position: string }[];
}

export interface BalanceReport {
    A: TeamSummary;
    B: TeamSummary;
    averageDiff: number;
    unassigned: number;
    notes: string[];
}

export async function balanceReport(matchId: string): Promise<BalanceReport> {
    const match: any = await getMatchDetails(matchId);
    const group: any = match?.groupId ? await getGroupDetails(match.groupId) : null;
    const participants: any[] = ((await getMatchParticipants(matchId)) as any[]).filter(p => p.status === 'IN');

    // Same rating as the team builder: group level plus current form, or the display overall.
    const profiles = new Map<string, any>();
    await Promise.all(participants.map(async p => profiles.set(p.userId, await getUserProfile(p.userId).catch(() => null))));

    const summarize = (team: 'A' | 'B'): TeamSummary => {
        const players = participants.filter(p => p.team === team).map(p => {
            const profile = profiles.get(p.userId);
            const rating = profile ? matchRating(profile, group?.memberRatings?.[p.userId]) : 50;
            return { name: p.name || 'Oyuncu', rating, position: normalizePosition(p.position) };
        });
        const positions = { GK: 0, DF: 0, MF: 0, FW: 0 };
        players.forEach(p => { positions[p.position as keyof typeof positions]++; });
        const total = players.reduce((sum, p) => sum + p.rating, 0);
        return { count: players.length, total, average: players.length ? Math.round(total / players.length) : 0, positions, players: players.sort((a, b) => b.rating - a.rating) };
    };

    const A = summarize('A');
    const B = summarize('B');
    const notes: string[] = [];
    const averageDiff = Math.abs(A.average - B.average);
    if (A.count + B.count === 0) notes.push('Takımlar henüz kaydedilmemiş. Kadro Kurucu’da dağıtıp kaydet.');
    if (Math.abs(A.count - B.count) > 1) notes.push('Takımların oyuncu sayısı dengesiz.');
    if (A.positions.GK === 0 || B.positions.GK === 0) {
        if (A.positions.GK + B.positions.GK >= 2) notes.push('İki kaleci aynı takımda.');
    }
    if (averageDiff > 3) notes.push(`Ortalama farkı ${averageDiff} puan; 3’ün altı dengeli sayılır.`);
    if (notes.length === 0 && A.count + B.count > 0) notes.push('Takımlar dengeli görünüyor.');
    return { A, B, averageDiff, unassigned: participants.filter(p => p.team !== 'A' && p.team !== 'B').length, notes };
}

/* ─────────────────────────── Cleanup ─────────────────────────── */

export async function cleanupTestLab(groupId: string | null, uids: BotUids, log: Log) {
    const uid = auth.currentUser?.uid;
    if (!uid) throw new Error('Oturum bulunamadı');

    const mine = await getDocs(query(collection(db, 'matches'), where('creatorId', '==', uid), where('isTestMatch', '==', true)));
    let cancelled = 0;
    for (const match of mine.docs) {
        if (match.data().isDeleted) continue;
        await deleteMatch(match.id);
        cancelled++;
    }
    log(`✓ ${cancelled} test maçı iptal edildi`);

    if (!groupId) return;
    const groupSnap = await getDoc(doc(db, 'groups', groupId));
    const members: string[] = groupSnap.exists() ? groupSnap.data().members || [] : [];
    for (const bot of BOTS) {
        const botUid = uids[bot.key];
        if (!botUid || !members.includes(botUid)) continue;
        // Leaving is done by the bot itself (rules only let members remove themselves).
        await asBot(bot, ({ db: botDb }) => updateDoc(doc(botDb, 'groups', groupId), { members: arrayRemove(botUid) }));
        log(`← ${bot.name} gruptan ayrıldı`);
    }
}
