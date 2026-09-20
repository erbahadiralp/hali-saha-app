import { collection, doc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { MvpCandidate } from './mvpLogic';

/**
 * Simulates random votes from multiple fictional users.
 * This helps verify the "Winner" calculation and system load.
 */
export async function simulateMvpVotes(
    matchId: string,
    candidates: MvpCandidate[],
    numberOfVoters: number = 5,
    currentUserId: string
) {
    if (!__DEV__) {
        throw new Error("Geliştirici araçları sadece geliştirme ortamında çalışabilir.");
    }
    if (candidates.length < 2) return;

    const batch = writeBatch(db);
    const voteCollection = collection(db, 'mvp_votes');

    // To bypass Firestore rules (oylayanId == auth.uid), we must use the current user's ID
    // for all simulated votes if we updated rules.
    // However, since we couldn't deploy rules, we will use the current user ID.
    // We will still create 'numberOfVoters' distinct vote entries, but all from the same user ID to pass security.
    // Ideally, for proper simulation, we would fix rules, but this is a workaround for live dev environment.

    // Actually, if we use the same userId, it might look like duplicate voting. 
    // But since mvp_votes are individual documents, it's allowed.

    for (let i = 0; i < numberOfVoters; i++) {
        // Each "simulated user session" generates 5 votes
        for (let j = 0; j < 5; j++) {
            // Pick two random candidates
            const c1 = candidates[Math.floor(Math.random() * candidates.length)];
            const c2 = candidates[Math.floor(Math.random() * candidates.length)];

            if (c1.odaylarId === c2.odaylarId) continue;

            const winner = Math.random() > 0.5 ? c1 : c2;

            const voteRef = doc(voteCollection);
            batch.set(voteRef, {
                matchId,
                odaylar1Id: c1.odaylarId,
                odaylar2Id: c2.odaylarId,
                secilenId: winner.odaylarId,
                oylayanId: currentUserId, // Revert to admin ID to pass Firestore security rules
                timestamp: serverTimestamp(),
                isSimulation: true,
                simulatedUserIndex: i // Metadata to track it was meant to be different users
            });
        }
    }

    await batch.commit();
    console.log(`Simulated ${numberOfVoters * 5} votes for match ${matchId}`);
}
