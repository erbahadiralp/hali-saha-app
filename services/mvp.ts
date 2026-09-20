import { Firestore, collection, doc, getDoc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { calculateMvpScore, generateKingOfTheHillMatchups, MatchAction, MatchPosition, MvpCandidate, MvpVote, MvpVotingSession, normalizePosition } from './mvpLogic';

export { calculateMvpScore, generateKingOfTheHillMatchups, MatchAction, MatchPosition, MvpCandidate, MvpVote, MvpVotingSession, normalizePosition };

/**
 * Select MVP candidates (Top 4 + 1 Joker)
 * Rules:
 * 1. Top 4 by score
 * 2. If losing team has no one in top 4, replace 4th with losing team's best
 * 3. 5th is admin's joker pick
 */
export function selectMvpCandidates(
    players: { userId: string; displayName: string; photoURL?: string; position: MatchPosition; team: 'A' | 'B'; actions: MatchAction }[],
    winningTeam: 'A' | 'B' | 'draw',
    jokerPick?: string
): MvpCandidate[] {
    // Calculate scores for all players
    const scoredPlayers = players.map(p => ({
        ...p,
        mvpScore: calculateMvpScore(p.position, p.actions)
    }));

    // Sort by score descending
    scoredPlayers.sort((a, b) => b.mvpScore - a.mvpScore);

    // Get top 4
    let candidates: MvpCandidate[] = scoredPlayers.slice(0, 4).map(p => ({
        odaylarId: p.userId,
        displayName: p.displayName,
        photoURL: p.photoURL,
        position: p.position,
        team: p.team,
        mvpScore: p.mvpScore,
        stats: p.actions
    }));

    // Check if losing team is represented (if not a draw)
    if (winningTeam !== 'draw') {
        const losingTeam = winningTeam === 'A' ? 'B' : 'A';
        const hasLosingTeamInTop4 = candidates.some(c => c.team === losingTeam);

        if (!hasLosingTeamInTop4) {
            // Find best player from losing team
            const losingTeamPlayers = scoredPlayers.filter(p => p.team === losingTeam);
            if (losingTeamPlayers.length > 0) {
                const bestLoser = losingTeamPlayers[0];
                // Replace 4th candidate
                candidates[3] = {
                    odaylarId: bestLoser.userId,
                    displayName: bestLoser.displayName,
                    photoURL: bestLoser.photoURL,
                    position: bestLoser.position,
                    team: bestLoser.team,
                    mvpScore: bestLoser.mvpScore,
                    stats: bestLoser.actions
                };
            }
        }
    }

    // Add 5th candidate (Joker)
    if (jokerPick) {
        const joker = scoredPlayers.find(p => p.userId === jokerPick);
        if (joker && !candidates.some(c => c.odaylarId === joker.userId)) {
            candidates.push({
                odaylarId: joker.userId,
                displayName: joker.displayName,
                photoURL: joker.photoURL,
                position: joker.position,
                team: joker.team,
                mvpScore: joker.mvpScore,
                isJoker: true,
                stats: joker.actions
            });
        }
    } else {
        // Suggest 5th place as default joker
        if (scoredPlayers.length > 4) {
            const fifthPlace = scoredPlayers[4];
            if (!candidates.some(c => c.odaylarId === fifthPlace.userId)) {
                candidates.push({
                    odaylarId: fifthPlace.userId,
                    displayName: fifthPlace.displayName,
                    photoURL: fifthPlace.photoURL,
                    position: fifthPlace.position,
                    team: fifthPlace.team,
                    mvpScore: fifthPlace.mvpScore,
                    isJoker: true,
                    stats: fifthPlace.actions
                });
            }
        }
    }

    return candidates;
}

/**
 * JOKER_CONSTRAINTS: Check if admin can pick a joker
 * - Admin who played in the match cannot pick joker
 * - Maximum 1 joker per match
 */
export function canPickJoker(
    adminId: string,
    players: { userId: string }[],
    existingJoker?: string
): { allowed: boolean; reason?: string } {
    // Admin played in the match — can't pick joker
    const adminPlayed = players.some(p => p.userId === adminId);
    if (adminPlayed) {
        return { allowed: false, reason: 'Bu maçta oynadığınız için joker seçemezsiniz.' };
    }

    // Already has a joker
    if (existingJoker) {
        return { allowed: false, reason: 'Bu maç için zaten bir joker seçildi.' };
    }

    return { allowed: true };
}



/**
 * Tally votes and determine winner
 */
export function tallyVotes(votes: MvpVote[]): { odaylarId: string; wins: number }[] {
    const winCounts: Record<string, number> = {};

    votes.forEach(vote => {
        winCounts[vote.secilenId] = (winCounts[vote.secilenId] || 0) + 1;
    });

    return Object.entries(winCounts)
        .map(([odaylarId, wins]) => ({ odaylarId, wins }))
        .sort((a, b) => b.wins - a.wins);
}

/**
 * Save MVP voting session to Firestore
 */
export async function saveMvpVotingSession(matchId: string, candidates: MvpCandidate[], { firestore = db }: { firestore?: Firestore } = {}) {
    try {
        const docRef = doc(firestore, 'mvp_sessions', matchId);
        const batch = writeBatch(firestore);

        batch.set(docRef, {
            matchId,
            candidates,
            results: [],
            isComplete: false,
            createdAt: serverTimestamp()
        });

        await batch.commit();
        return true;
    } catch (error) {
        console.error('Error saving MVP session:', error);
        throw error;
    }
}

/**
 * Record a vote in the MVP session
 * In King of the Hill, a user votes multiple times in one session (round 1, 2, 3...)
 * We need to ensure they don't vote for the exact same matchup again, or restrict the total number of votes they can cast per match to the number of candidates - 1.
 * For now, we allow the UI to control the flow, but we check if they already voted in this specific matchup.
 */
export async function recordMvpVote(
    matchId: string,
    odaylar1Id: string,
    odaylar2Id: string,
    secilenId: string,
    oylayanId: string,
    { firestore = db }: { firestore?: Firestore } = {}
) {
    try {
        // Prevent duplicate votes for the exact same matchup by the same user
        const votesQuery = query(
            collection(firestore, 'mvp_votes'),
            where('matchId', '==', matchId),
            where('oylayanId', '==', oylayanId),
            where('odaylar1Id', '==', odaylar1Id),
            where('odaylar2Id', '==', odaylar2Id)
        );
        const existingVotes = await getDocs(votesQuery);
        if (!existingVotes.empty) {
            console.warn('User already voted for this matchup');
            return false;
        }

        const voteRef = doc(collection(firestore, 'mvp_votes'));
        const batch = writeBatch(firestore);

        batch.set(voteRef, {
            matchId,
            odaylar1Id,
            odaylar2Id,
            secilenId,
            oylayanId,
            timestamp: serverTimestamp()
        });

        await batch.commit();
        return true;
    } catch (error) {
        console.error('Error recording MVP vote:', error);
        throw error;
    }
}

/**
 * Get MVP voting results for a match
 */
export async function getMvpResults(matchId: string) {
    try {
        const votesQuery = query(
            collection(db, 'mvp_votes'),
            where('matchId', '==', matchId)
        );
        const snapshot = await getDocs(votesQuery);

        const votes: MvpVote[] = snapshot.docs.map(doc => ({
            ...doc.data(),
            timestamp: doc.data().timestamp?.toDate()
        })) as MvpVote[];

        return tallyVotes(votes);
    } catch (error) {
        console.error('Error getting MVP results:', error);
        throw error;
    }
}

/**
 * Get MVP voting session for a match
 */
export async function getMvpSession(matchId: string): Promise<MvpVotingSession | null> {
    try {
        const docRef = doc(db, 'mvp_sessions', matchId);
        const sessionDoc = await getDoc(docRef);

        if (sessionDoc.exists()) {
            return sessionDoc.data() as MvpVotingSession;
        }
        return null;
    } catch (error) {
        console.error('Error getting MVP session:', error);
        return null;
    }
}

/**
 * Update MVP candidates (for Admin Joker)
 */
export async function updateMvpCandidates(matchId: string, candidates: MvpCandidate[]) {
    try {
        const docRef = doc(db, 'mvp_sessions', matchId);
        await updateDoc(docRef, { candidates });
        return true;
    } catch (error) {
        console.error('Error updating MVP candidates:', error);
        throw error;
    }
}

/**
 * Force close a voting session and award MVP to the winner
 */
export async function closeVotingSession(matchId: string) {
    try {
        const docRef = doc(db, 'mvp_sessions', matchId);

        // 1. Calculate the winner before closing
        const results = await getMvpResults(matchId);
        let winnerId = null;

        if (results.length > 0) {
            winnerId = results[0].odaylarId;
        }

        const batch = writeBatch(db);

        // 2. Mark session as complete
        batch.update(docRef, {
            isComplete: true,
            closedAt: serverTimestamp(),
            mvpId: winnerId
        });

        // 3. Record the winner where every screen reads it (matches.motm, participant isMotm).
        // Profile MVP counts and XP are rebuilt by the server from these fields; writing another
        // user's profile from the client is not allowed by the security rules.
        if (winnerId) {
            batch.update(doc(db, 'matches', matchId), { motm: winnerId });

            const participantsRef = collection(db, 'match_participants');
            const q = query(participantsRef, where('matchId', '==', matchId), where('userId', '==', winnerId));
            const partSnap = await getDocs(q);
            if (!partSnap.empty) {
                batch.update(partSnap.docs[0].ref, { isMotm: true });
            }
        }

        await batch.commit();
        return true;
    } catch (error) {
        console.error('Error closing voting session:', error);
        throw error;
    }
}

/**
 * Check if a user has completed their King of the Hill voting session
 * A completed session means they have cast at least (candidates.length - 1) votes,
 * which is the number of rounds in a KotH tournament.
 */
export async function hasUserCompletedVoting(matchId: string, userId: string): Promise<boolean> {
    try {
        const sessionDoc = await getDoc(doc(db, 'mvp_sessions', matchId));
        if (!sessionDoc.exists()) return false;

        const candidatesCount = sessionDoc.data().candidates?.length || 0;
        if (candidatesCount < 2) return false;

        const requiredVotes = candidatesCount - 1;

        const votesQuery = query(
            collection(db, 'mvp_votes'),
            where('matchId', '==', matchId),
            where('oylayanId', '==', userId)
        );
        const snapshot = await getDocs(votesQuery);

        // Filter out simulated votes (from dev tools)
        const realVotes = snapshot.docs.filter(doc => !doc.data().isSimulation);

        // If they cast enough votes to complete the bracket, they are done.
        return realVotes.length >= requiredVotes;
    } catch (error) {
        console.error('Error checking user vote status:', error);
        return false;
    }
}
