import { arrayUnion, collection, doc, getDocs, updateDoc } from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { DEV_CREDENTIALS_MISSING_MESSAGE, DEV_TEST_PASSWORD, hasDevTestPassword } from '../utils/devCredentials';

const GROUP_ID = 'MUMShAaabo68tcV9kdhK';

export async function addAllUsersToGroup() {
    if (!__DEV__) {
        throw new Error("Geliştirici araçları sadece geliştirme ortamında çalışabilir.");
    }
    console.log(`Starting batch add to group: ${GROUP_ID}`);

    try {
        // 1. Get all users
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const userIds = usersSnapshot.docs.map(doc => doc.id);

        console.log(`Found ${userIds.length} users.`);

        if (userIds.length === 0) {
            console.log("No users found.");
            // Even if no users, we might want to ensure group exists? But let's return for now.
            return;
        }

        // 2. Ensure Group Exists & Add Users
        // We use setDoc with { merge: true } instead of updateDoc to avoid crashes if doc is missing.
        const groupRef = doc(db, 'groups', GROUP_ID);

        // Chunking
        const chunkSize = 50;
        for (let i = 0; i < userIds.length; i += chunkSize) {
            const chunk = userIds.slice(i, i + chunkSize);

            // For the first chunk, we might want to ensure "name" exists if we are creating it from scratch?
            // But let's assume if it's new, we just dump members.
            // Actually, if we create a group without a name, the app might crash elsewhere.
            // Let's check existence ONCE.
            if (i === 0) {
                const groupSnap = await import('firebase/firestore').then(mod => mod.getDoc(groupRef));
                if (!groupSnap.exists()) {
                    await import('firebase/firestore').then(mod => mod.setDoc(groupRef, {
                        name: "Developers Group",
                        createdAt: new Date(),
                        members: [],
                        photoURL: null
                    }));
                }
            }



            await updateDoc(groupRef, {
                members: arrayUnion(...chunk)
            });
            console.log(`Added users ${i} to ${i + chunk.length}`);
        }

        console.log("All users added to group successfully.");
        // Notify user about success if called from UI (UI handles this via catch/finally)

    } catch (error: any) {
        console.error("Error adding users to group:", error);
        throw error; // Re-throw so UI can catch and alert
    }
}

export async function autoJoinLatestMatch() {
    if (!__DEV__) {
        throw new Error("Geliştirici araçları sadece geliştirme ortamında çalışabilir.");
    }
    if (!hasDevTestPassword()) {
        throw new Error(DEV_CREDENTIALS_MISSING_MESSAGE);
    }
    console.log("Starting auto-join for latest match...");
    const { collection, query, where, orderBy, limit, getDocs } = await import('firebase/firestore');
    const { getApp, getApps, initializeApp } = await import('firebase/app');
    const { getAuth, signInWithEmailAndPassword, signOut, initializeAuth, inMemoryPersistence } = await import('firebase/auth');
    const { isMatchFullError, joinMatch } = await import('./firestore');
    const { SPECIAL_USERS, testAccountEmail } = await import('./adminUsers'); // Import test users list

    // 1. Find the latest upcoming match
    const matchesRef = collection(db, 'matches');
    const q = query(
        matchesRef,
        where('status', '==', 'UPCOMING'),
        orderBy('date', 'desc'),
        limit(1)
    );

    let snapshot;
    try {
        snapshot = await getDocs(q);
    } catch (error: any) {
        if (error.code === 'failed-precondition' || error.message?.includes('index')) {
            // Extract URL from error message if possible, or throwing a known error structure
            // The error message usually contains: "The query requires an index. You can create it here: https://..."
            const urlMatch = error.message?.match(/https:\/\/[^\s]+/);
            const indexUrl = urlMatch ? urlMatch[0] : null;

            if (indexUrl) {
                const err: any = new Error("Firestore Index Gerekli");
                err.indexUrl = indexUrl;
                throw err;
            }
        }
        throw error;
    }

    if (snapshot.empty) {
        throw new Error("Gelecek maç bulunamadı. Lütfen önce bir maç oluşturun.");
    }

    const matchDoc = snapshot.docs[0];
    const matchId = matchDoc.id;
    const matchData = matchDoc.data();
    console.log(`Found match: ${matchId} (${matchData.venue})`);

    // 2. Setup Secondary App for Auth
    const SECONDARY_APP_NAME = 'SecondaryAppForAutoJoin';
    let secondaryApp;
    let secondaryAuth;
    const existingApp = getApps().find(app => app.name === SECONDARY_APP_NAME);
    if (existingApp) {
        secondaryApp = existingApp;
        secondaryAuth = getAuth(secondaryApp);
    } else {
        const defaultApp = getApp();
        secondaryApp = initializeApp(defaultApp.options, SECONDARY_APP_NAME);
        secondaryAuth = initializeAuth(secondaryApp, { persistence: inMemoryPersistence });
    }

    let joinedCount = 0;
    let waitlistCount = 0;
    const errors: string[] = [];

    // 3. User Loop
    // Use SPECIAL_USERS for consistent test data
    for (const user of SPECIAL_USERS) {
        try {
            const email = testAccountEmail(user.name);
            const password = DEV_TEST_PASSWORD;

            try {
                const cred = await signInWithEmailAndPassword(secondaryAuth, email, password);
                const uid = cred.user.uid;

                // Try to join
                try {
                    await joinMatch(matchId, uid, user.name, 'IN');
                    joinedCount++;
                    console.log(`${user.name} joined as IN.`);
                } catch (joinErr: any) {
                    if (isMatchFullError(joinErr)) {
                        await joinMatch(matchId, uid, user.name, 'WAITLIST');
                        waitlistCount++;
                        console.log(`${user.name} joined as WAITLIST.`);
                    } else {
                        // Maybe already joined?
                        console.log(`${user.name} failed to join:`, joinErr);
                        // If "Maç bulunamadı" or real error, throw
                        if (joinErr.message?.includes('bulunamadı')) throw joinErr;
                    }
                }

                await signOut(secondaryAuth);

            } catch (authErr: any) {
                console.error(`Auth failed for ${user.name}:`, authErr.code);
                errors.push(`${user.name}: Auth Failed`);
            }

        } catch (e: any) {
            console.error(`Error processing ${user.name}:`, e);
            errors.push(`${user.name}: ${e.message}`);
        }
    }

    return {
        matchVenue: matchData.venue,
        joinedCount,
        waitlistCount,
        errors
    };
}
