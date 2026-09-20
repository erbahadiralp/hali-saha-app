import { collection, doc, getDoc, getDocs, limit, orderBy, query, where, writeBatch, addDoc, setDoc, deleteDoc, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { normalizePosition, selectMvpCandidates, saveMvpVotingSession } from './mvp';
import { simulateMvpVotes } from './mvpDebug';

// Helper to get or create a group for test matches
const getTestGroupId = async (userId: string): Promise<string> => {
    const membersRef = collection(db, 'group_members');
    const q = query(membersRef, where('userId', '==', userId), limit(1));
    const snap = await getDocs(q);
    if (!snap.empty) {
        return snap.docs[0].data().groupId;
    }
    
    // Fallback: get any public group
    const groupsSnap = await getDocs(query(collection(db, 'groups'), limit(1)));
    if (!groupsSnap.empty) {
        return groupsSnap.docs[0].id;
    }
    
    // Fallback 2: create a mock group for testing if none exists
    const groupRef = await addDoc(collection(db, 'groups'), {
        name: 'Test Halısahası',
        description: 'Geliştirici Test ve Simülasyon Grubu',
        createdAt: new Date(),
        adminId: userId,
        members: [userId],
        privacy: 'public'
    });
    
    // Add user as admin member
    await setDoc(doc(db, 'group_members', `${groupRef.id}_${userId}`), {
        groupId: groupRef.id,
        userId,
        role: 'admin',
        joinedAt: new Date()
    });
    
    return groupRef.id;
};

// Helper to fetch/ensure 14 test users exist in Firestore
export const getTestPlayers = async (): Promise<{ uid: string; name: string; position?: string; [key: string]: any }[]> => {
    const q = query(
        collection(db, 'users'),
        where('username', '>=', 'test_player_'),
        where('username', '<=', 'test_player_\uf8ff'),
        limit(20)
    );
    const snap = await getDocs(q);
    const players = snap.docs.map(doc => ({
        uid: doc.id,
        name: doc.data().name || `Test Player`,
        ...doc.data()
    }));

    if (players.length < 14) {
        throw new Error("Sistemde yeterli test oyuncusu yok. Lütfen önce 'Özel Oyuncuları Oluştur' butonunu kullanarak test oyuncularını oluşturun.");
    }
    return players;
};

/**
 * Scenario 1: Create Upcoming Match
 * Creates a match with status UPCOMING, registers 14 players, and splits them into Team A (7) and Team B (7).
 */
export const createUpcomingMatchScenario = async (userId: string) => {
    if (!__DEV__) throw new Error("Geliştirici araçları sadece geliştirme ortamında çalışabilir.");
    
    const groupId = await getTestGroupId(userId);
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours later
    
    // Create match doc
    const matchRef = await addDoc(collection(db, 'matches'), {
        groupId,
        venue: 'Kadıköy Halı Sahası (Test)',
        date: tomorrow,
        status: 'UPCOMING',
        maxPlayers: 14,
        feePerPerson: 150,
        createdAt: new Date(),
        creatorId: userId,
        isSimulation: true // Mark as simulation for easy reset
    });
    const matchId = matchRef.id;

    const testPlayers = await getTestPlayers();
    const batch = writeBatch(db);
    
    // Add current logged in user to Team A
    batch.set(doc(db, 'match_participants', `${matchId}_${userId}`), {
        matchId,
        userId,
        team: 'A',
        status: 'IN',
        joinedAt: new Date(),
        statsSubmitted: false
    });

    // Add 13 test players (6 to Team A, 7 to Team B)
    for (let i = 0; i < 13; i++) {
        const player = testPlayers[i];
        const team = i < 6 ? 'A' : 'B';
        batch.set(doc(db, 'match_participants', `${matchId}_${player.uid}`), {
            matchId,
            userId: player.uid,
            name: player.name,
            team,
            status: 'IN',
            joinedAt: new Date(),
            statsSubmitted: false
        });
    }

    await batch.commit();
    return matchId;
};

/**
 * Scenario 2: Create Finished Match
 * Creates a finished match (score 5-4) with full stats and performance ratings submitted for all 14 players.
 */
export const createFinishedMatchScenario = async (userId: string) => {
    if (!__DEV__) throw new Error("Geliştirici araçları sadece geliştirme ortamında çalışabilir.");
    
    const groupId = await getTestGroupId(userId);
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000); // 2 hours ago
    const scoreA = 5;
    const scoreB = 4;

    const matchRef = await addDoc(collection(db, 'matches'), {
        groupId,
        venue: 'Kadıköy Halı Sahası (Test)',
        date: twoHoursAgo,
        status: 'FINISHED',
        maxPlayers: 14,
        feePerPerson: 150,
        scoreA,
        scoreB,
        finishedAt: new Date(Date.now() - 30 * 60 * 1000), // finished 30 mins ago
        createdAt: new Date(),
        creatorId: userId,
        isSimulation: true
    });
    const matchId = matchRef.id;

    const testPlayers = await getTestPlayers();
    const batch = writeBatch(db);

    // 1. Add current user
    batch.set(doc(db, 'match_participants', `${matchId}_${userId}`), {
        matchId,
        userId,
        team: 'A',
        status: 'IN',
        joinedAt: new Date(),
        goals: 2,
        assists: 1,
        saves: 0,
        cleanSheet: false,
        won: true,
        statsSubmitted: true
    });

    // 2. Add 13 test players
    let goalsA = 2; // User has 2 goals. Remaining: 3 goals for Team A
    let goalsB = 0; // Remaining: 4 goals for Team B

    for (let i = 0; i < 13; i++) {
        const player = testPlayers[i];
        const team = i < 6 ? 'A' : 'B';
        const won = team === 'A';
        
        let goals = 0;
        let assists = 0;
        let saves = 0;

        if (team === 'A') {
            if (goalsA < scoreA && Math.random() > 0.5) {
                goals = 1;
                goalsA++;
            }
            assists = Math.random() > 0.5 ? 1 : 0;
        } else {
            if (goalsB < scoreB && Math.random() > 0.4) {
                goals = 1;
                goalsB++;
            }
            assists = Math.random() > 0.5 ? 1 : 0;
        }

        // Give GK some saves
        if (i === 0 || i === 6) { // GK for each team
            saves = Math.floor(Math.random() * 5) + 3;
        }

        batch.set(doc(db, 'match_participants', `${matchId}_${player.uid}`), {
            matchId,
            userId: player.uid,
            name: player.name,
            team,
            status: 'IN',
            joinedAt: new Date(),
            goals,
            assists,
            saves,
            cleanSheet: false,
            won,
            statsSubmitted: true
        });
        // Career totals are rebuilt by Cloud Functions from these participant entries.
    }

    await batch.commit();
    return matchId;
};

/**
 * Scenario 3: Simulate MVP Voting Session
 * Creates a finished match, activates MVP voting (sets finishedAt to 15 mins ago to warp it into the [10, 31] min window),
 * and generates 5 mock votes on candidates so the user can immediately vote and see results.
 */
export const simulateMvpVotingScenario = async (userId: string) => {
    if (!__DEV__) throw new Error("Geliştirici araçları sadece geliştirme ortamında çalışabilir.");
    
    // Create finished match first
    const matchId = await createFinishedMatchScenario(userId);
    
    // Warp the finishedAt and match dates to place it inside the active oylama window (15 mins ago)
    const matchRef = doc(db, 'matches', matchId);
    const fifteenMinsAgo = new Date(Date.now() - 15 * 60 * 1000);
    const matchStartTime = new Date(Date.now() - 105 * 60 * 1000);
    
    await updateDoc(matchRef, {
        date: matchStartTime,
        finishedAt: fifteenMinsAgo
    });

    // Generate candidates
    const participantsRef = collection(db, 'match_participants');
    const qParts = query(participantsRef, where('matchId', '==', matchId));
    const partsSnapshot = await getDocs(qParts);
    
    const playersForMvp = partsSnapshot.docs
        .map(d => d.data())
        .filter((p: any) => p.status === 'IN')
        .map((p: any) => ({
            userId: p.userId,
            displayName: p.name || 'Test Player',
            position: normalizePosition(p.position || 'MID'),
            team: p.team || 'A',
            actions: { goals: p.goals || 0, assists: p.assists || 0, saves: p.saves || 0, cleanSheet: false },
        }));

    const winningTeam = 'A'; // Team A won 5-4
    const candidates = selectMvpCandidates(playersForMvp as any, winningTeam);

    if (candidates.length >= 2) {
        // Create MVP session doc
        await saveMvpVotingSession(matchId, candidates);
        
        // Simulate 5 mock votes using other test players
        console.log(`Simulating mock votes on ${candidates.length} candidates...`);
        await simulateMvpVotes(matchId, candidates, 5, userId);
    } else {
        throw new Error("MVP adayları oluşturulamadı.");
    }

    return matchId;
};

/**
 * Scenario 4: Simulate Dispute Flow
 * Creates a finished match, and injects a mock dispute objection from a test player.
 */
export const simulateDisputeFlowScenario = async (userId: string) => {
    if (!__DEV__) throw new Error("Geliştirici araçları sadece geliştirme ortamında çalışabilir.");
    
    // Create finished match
    const matchId = await createFinishedMatchScenario(userId);
    
    // Get test players
    const testPlayers = await getTestPlayers();
    const testPlayer = testPlayers[0]; // Test Player 1

    // Add a dispute document
    const disputeRef = await addDoc(collection(db, 'disputes'), {
        matchId,
        playerId: testPlayer.uid,
        adminId: userId, // logged in user is admin
        field: 'goals',
        oldValue: 3,
        newValue: 1,
        status: 'open',
        createdAt: new Date(),
        deadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
        adminDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
        playerMessage: 'Gollerimin 2 tanesi yazılmadı, hakkım yeniyor!', // mock player message objection
        objectedAt: new Date(),
        isSimulation: true
    });

    return { matchId, disputeId: disputeRef.id };
};

/**
 * Scenario 5: Reset Test Data
 * Wipes out all simulator matches (isSimulation: true), disputes, mvp_sessions, and resets test user stats back to 0.
 */
export const resetTestDataScenario = async () => {
    if (!__DEV__) throw new Error("Geliştirici araçları sadece geliştirme ortamında çalışabilir.");
    
    const batch = writeBatch(db);

    // 1. Get all matches marked with isSimulation
    const matchesRef = collection(db, 'matches');
    const qMatches = query(matchesRef, where('isSimulation', '==', true));
    const matchesSnap = await getDocs(qMatches);
    const simulationMatchIds = matchesSnap.docs.map(doc => doc.id);

    console.log(`Cleaning up ${simulationMatchIds.length} simulation matches...`);

    // Delete matches docs
    matchesSnap.docs.forEach(doc => {
        batch.delete(doc.ref);
    });

    // 2. Delete participant docs for these matches
    for (const matchId of simulationMatchIds) {
        const partsQuery = query(collection(db, 'match_participants'), where('matchId', '==', matchId));
        const partsSnap = await getDocs(partsQuery);
        partsSnap.docs.forEach(doc => {
            batch.delete(doc.ref);
        });

        // 3. Delete mvp_sessions docs
        const sessionRef = doc(db, 'mvp_sessions', matchId);
        batch.delete(sessionRef);

        // 4. Delete mvp_votes docs
        const votesQuery = query(collection(db, 'mvp_votes'), where('matchId', '==', matchId));
        const votesSnap = await getDocs(votesQuery);
        votesSnap.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
    }

    // 5. Delete simulation disputes
    const disputesQuery = query(collection(db, 'disputes'), where('isSimulation', '==', true));
    const disputesSnap = await getDocs(disputesQuery);
    disputesSnap.docs.forEach(doc => {
        batch.delete(doc.ref);
    });

    // Also clean up any disputes that belong to simulation matches
    for (const matchId of simulationMatchIds) {
        const matchDisputesQuery = query(collection(db, 'disputes'), where('matchId', '==', matchId));
        const matchDisputesSnap = await getDocs(matchDisputesQuery);
        matchDisputesSnap.docs.forEach(doc => {
            batch.delete(doc.ref);
        });
    }

    // Test players' profile stats are server-owned; deleting the matches makes Cloud Functions rebuild them.

    await batch.commit();
    return { success: true, resetCount: simulationMatchIds.length };
};
