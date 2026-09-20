
import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import { Auth, createUserWithEmailAndPassword, getAuth, initializeAuth, inMemoryPersistence, signInWithEmailAndPassword, signOut, updateProfile } from 'firebase/auth';
import { doc, getDoc, getFirestore, serverTimestamp, setDoc } from 'firebase/firestore';
import { DEV_CREDENTIALS_MISSING_MESSAGE, DEV_TEST_EMAIL_DOMAIN, DEV_TEST_PASSWORD, hasDevTestPassword } from '../utils/devCredentials';

/**
 * Seed roster used by the developer panel to populate a realistic squad.
 * Names are intentionally generic — this list ships in the repository.
 */
export const SPECIAL_USERS = [
    { name: "Test Kaleci 1", position: "GK" },
    { name: "Test Kaleci 2", position: "GK" },
    { name: "Test Defans 1", position: "DEF" },
    { name: "Test Defans 2", position: "DEF" },
    { name: "Test Defans 3", position: "DEF" },
    { name: "Test Defans 4", position: "DEF" },
    { name: "Test Orta Saha 1", position: "MID" },
    { name: "Test Forvet 1", position: "FWD" },
    { name: "Test Forvet 2", position: "FWD" },
    { name: "Test Forvet 3", position: "FWD" },
    { name: "Test Forvet 4", position: "FWD" },
    { name: "Test Forvet 5", position: "FWD" },
    { name: "Test Forvet 6", position: "FWD" }
];

/** Slug used as both the username and the email local part: "Test Kaleci 1" -> "testkaleci1". */
export const testAccountUsername = (name: string): string =>
    name
        .toLowerCase()
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ı/g, 'i')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .replace(/\s+/g, '');

/** Email address of a seeded test account. */
export const testAccountEmail = (name: string): string =>
    `${testAccountUsername(name)}@${DEV_TEST_EMAIL_DOMAIN}`;

export const createSpecialUsers = async () => {
    if (!__DEV__) {
        throw new Error("Geliştirici araçları sadece geliştirme ortamında çalışabilir.");
    }
    if (!hasDevTestPassword()) {
        throw new Error(DEV_CREDENTIALS_MISSING_MESSAGE);
    }
    // 1. Setup Secondary App for Auth (to not sign out current user)
    const SECONDARY_APP_NAME = 'SecondaryAppForSpecialUsers';
    let secondaryApp: FirebaseApp;
    let secondaryAuth: Auth;

    const existingApp = getApps().find(app => app.name === SECONDARY_APP_NAME);
    if (existingApp) {
        secondaryApp = existingApp;
        secondaryAuth = getAuth(secondaryApp);
    } else {
        const defaultApp = getApp(); // Main app
        secondaryApp = initializeApp(defaultApp.options, SECONDARY_APP_NAME);
        secondaryAuth = initializeAuth(secondaryApp, { persistence: inMemoryPersistence });
    }

    const db = getFirestore(getApp()); // Main DB

    let createdCount = 0;
    let updatedCount = 0;
    const errors: string[] = [];

    for (const user of SPECIAL_USERS) {
        try {
            // Generate credentials
            const cleanName = testAccountUsername(user.name);
            const email = testAccountEmail(user.name);
            const password = DEV_TEST_PASSWORD;
            const username = cleanName;

            let uid = '';

            try {
                // 1. Try to create new user
                const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
                uid = cred.user.uid;
                createdCount++;
            } catch (authError: any) {
                if (authError.code === 'auth/email-already-in-use') {
                    // 2. If email exists, we MUST verify ownership by logging in with the KNOWN test password.
                    // This prevents unauthorized account takeovers.
                    try {
                        const loginCred = await signInWithEmailAndPassword(secondaryAuth, email, password);
                        uid = loginCred.user.uid;
                        // If login succeeds, we know we own this test account.
                        updatedCount++;
                    } catch (loginError: any) {
                        // If password doesn't match, this is NOT our test account or password changed.
                        // Do NOT update it.
                        console.error(`Cannot login as existing user ${email}:`, loginError.code);
                        errors.push(`E-posta kullanımda (${email}) ve şifre farklı. Güncelleme atlandı.`);
                        continue;
                    }
                } else {
                    console.error(`Auth error for ${email}:`, authError);
                    errors.push(`${user.name}: Auth Hatası (${authError.code})`);
                    continue;
                }
            }

            if (uid && secondaryAuth.currentUser) {
                // Update Auth Profile
                await updateProfile(secondaryAuth.currentUser, {
                    displayName: user.name,
                    photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(user.name)}&background=random`
                });

                // Create/Update Firestore
                const userRef = doc(db, "users", uid);

                // Fields to always update (Name, Position, etc.)
                const userData: any = {
                    name: user.name,
                    displayName: user.name, // Ensure displayName is set for consistency
                    username: username,
                    email: email,
                    position: user.position,
                    bio: 'Halı Saha Oyuncusu',
                    preferences: { notifications: true, theme: 'system' }
                };

                // Merge with existing to preserve stats if exists
                await setDoc(userRef, userData, { merge: true });

                // Ensure critical fields exist only if missing
                const snap = await getDoc(userRef);
                if (!snap.exists() || !snap.data()?.createdAt) {
                    await setDoc(userRef, {
                        createdAt: serverTimestamp(),
                        matchesPlayed: 0,
                        rating: 5.0
                    }, { merge: true });
                }
            }

            await signOut(secondaryAuth);

        } catch (error: any) {
            console.error(`Error processing ${user.name}:`, error);
            errors.push(`${user.name}: ${error.message}`);
        }
    }

    return { createdCount, updatedCount, errors };
};
