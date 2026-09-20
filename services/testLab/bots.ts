import { FirebaseApp, getApp, getApps, initializeApp } from 'firebase/app';
import {
    Auth,
    createUserWithEmailAndPassword,
    getAuth,
    initializeAuth,
    inMemoryPersistence,
    signInWithEmailAndPassword,
} from 'firebase/auth';
import { Firestore, doc, getDoc, getFirestore, runTransaction, serverTimestamp } from 'firebase/firestore';
import type { Archetype } from '../overall';

/**
 * Test Lab bot accounts (development only).
 *
 * Bots are real Firebase Auth users. They act through a second Firebase app instance signed in as
 * the bot, so every join, stat entry and vote passes the same security rules and Cloud Functions
 * triggers as a second phone would. Profiles carry `isBot: true` so they are easy to find and clean up.
 */

export type BotPosition = 'GK' | 'DEF' | 'MID' | 'FWD';

export interface BotSeed {
    key: string;
    name: string;
    username: string;
    email: string;
    position: BotPosition;
    preferredFoot: 'right' | 'left' | 'both';
    /** Group level 1-10 the admin assigns in player setup. */
    skillLevel: number;
    archetype: Archetype;
}

export interface BotContext {
    bot: BotSeed;
    uid: string;
    db: Firestore;
}

const BOT_PASSWORD = 'TestLab#2026bot';
const BOT_DOMAIN = 'testlab.halisaha.app';

// A realistic 16-player pool: 2 keepers, 5 defenders, 5 midfielders, 4 forwards, levels 3-9.
const SEEDS: Omit<BotSeed, 'key' | 'username' | 'email'>[] = [
    { name: 'Emre Yıldız', position: 'GK', preferredFoot: 'right', skillLevel: 7, archetype: 'gk-reflex' },
    { name: 'Burak Demir', position: 'GK', preferredFoot: 'right', skillLevel: 4, archetype: 'gk-giant' },
    { name: 'Can Aydın', position: 'DEF', preferredFoot: 'right', skillLevel: 8, archetype: 'df-wall' },
    { name: 'Mert Kaya', position: 'DEF', preferredFoot: 'left', skillLevel: 6, archetype: 'df-wing-back' },
    { name: 'Oğuz Çelik', position: 'DEF', preferredFoot: 'right', skillLevel: 5, archetype: 'df-butcher' },
    { name: 'Serkan Arslan', position: 'DEF', preferredFoot: 'both', skillLevel: 7, archetype: 'df-ball-playing' },
    { name: 'Kaan Doğan', position: 'DEF', preferredFoot: 'right', skillLevel: 3, archetype: 'df-sweeper' },
    { name: 'Umut Şahin', position: 'MID', preferredFoot: 'right', skillLevel: 9, archetype: 'mf-maestro' },
    { name: 'Barış Koç', position: 'MID', preferredFoot: 'left', skillLevel: 6, archetype: 'mf-box-to-box' },
    { name: 'Onur Kurt', position: 'MID', preferredFoot: 'right', skillLevel: 5, archetype: 'mf-anchor' },
    { name: 'Tolga Özdemir', position: 'MID', preferredFoot: 'both', skillLevel: 7, archetype: 'mf-enganche' },
    { name: 'Hakan Polat', position: 'MID', preferredFoot: 'right', skillLevel: 4, archetype: 'mf-shadow-striker' },
    { name: 'Volkan Aksoy', position: 'FWD', preferredFoot: 'right', skillLevel: 8, archetype: 'fw-finisher' },
    { name: 'Cem Erdem', position: 'FWD', preferredFoot: 'left', skillLevel: 6, archetype: 'fw-speedster' },
    { name: 'Deniz Yalçın', position: 'FWD', preferredFoot: 'right', skillLevel: 5, archetype: 'fw-target-man' },
    { name: 'Arda Güneş', position: 'FWD', preferredFoot: 'both', skillLevel: 3, archetype: 'fw-poacher' },
];

const ascii = (text: string) =>
    text.toLocaleLowerCase('tr-TR')
        .replace(/ç/g, 'c').replace(/ğ/g, 'g').replace(/ı/g, 'i').replace(/ö/g, 'o').replace(/ş/g, 's').replace(/ü/g, 'u')
        .replace(/[^a-z0-9]/g, '');

export const BOTS: BotSeed[] = SEEDS.map((seed, i) => {
    const key = `bot${String(i + 1).padStart(2, '0')}`;
    return {
        ...seed,
        key,
        // Usernames must match ^[a-z0-9_]{3,20}$.
        username: `${key}_${ascii(seed.name.split(' ')[0])}`.slice(0, 20),
        email: `${key}@${BOT_DOMAIN}`,
    };
});

/* ─────────────────────────── Runner ─────────────────────────── */

const RUNNER_APP = 'test-lab-bots';
let runner: { app: FirebaseApp; auth: Auth; db: Firestore } | null = null;

function getRunner() {
    if (!__DEV__) throw new Error('Test Lab yalnızca geliştirme ortamında çalışır.');
    if (runner) return runner;
    const app = getApps().find(a => a.name === RUNNER_APP) ?? initializeApp(getApp().options, RUNNER_APP);
    let auth: Auth;
    try {
        // In-memory: bot sessions never touch the real user's stored login.
        auth = initializeAuth(app, { persistence: inMemoryPersistence });
    } catch {
        auth = getAuth(app);
    }
    runner = { app, auth, db: getFirestore(app) };
    return runner;
}

// One runner app switches identities, so bot actions are serialized.
let queue: Promise<unknown> = Promise.resolve();
function exclusive<T>(task: () => Promise<T>): Promise<T> {
    const result = queue.then(task, task);
    queue = result.catch(() => undefined);
    return result;
}

async function signInBot(bot: BotSeed, createIfMissing: boolean) {
    const { auth } = getRunner();
    if (auth.currentUser?.email === bot.email) return auth.currentUser;
    try {
        return (await signInWithEmailAndPassword(auth, bot.email, BOT_PASSWORD)).user;
    } catch (error: any) {
        const missing = ['auth/user-not-found', 'auth/invalid-credential', 'auth/invalid-login-credentials'].includes(error?.code);
        if (!createIfMissing || !missing) throw error;
        try {
            return (await createUserWithEmailAndPassword(auth, bot.email, BOT_PASSWORD)).user;
        } catch (createError: any) {
            if (createError?.code === 'auth/email-already-in-use') {
                throw new Error(`${bot.email} zaten var ama şifresi farklı. Firebase Console > Authentication'dan silip tekrar dene.`);
            }
            throw createError;
        }
    }
}

/** Runs `fn` signed in as the bot. The bot account must already exist (see ensureBot). */
export function asBot<T>(bot: BotSeed, fn: (ctx: BotContext) => Promise<T>): Promise<T> {
    return exclusive(async () => {
        const user = await signInBot(bot, false);
        return fn({ bot, uid: user.uid, db: getRunner().db });
    });
}

/** Creates (or signs in) the bot account and makes sure its profile and username exist. Returns its uid. */
export function ensureBot(bot: BotSeed): Promise<string> {
    return exclusive(async () => {
        const user = await signInBot(bot, true);
        const { db } = getRunner();
        const userRef = doc(db, 'users', user.uid);
        const existing = await getDoc(userRef);
        if (existing.exists() && existing.data().username) return user.uid;

        await runTransaction(db, async tx => {
            const reservationRef = doc(db, 'usernames', bot.username);
            const reservation = await tx.get(reservationRef);
            if (reservation.exists() && reservation.data().uid !== user.uid) {
                throw new Error(`${bot.username} kullanıcı adı başka bir hesapta.`);
            }
            if (!reservation.exists()) {
                tx.set(reservationRef, { uid: user.uid, email: bot.email, createdAt: serverTimestamp() });
            }
            tx.set(userRef, {
                name: bot.name,
                displayName: bot.name,
                username: bot.username,
                email: bot.email,
                position: bot.position,
                preferredFoot: bot.preferredFoot,
                skillLevel: bot.skillLevel,
                archetype: bot.archetype,
                photoURL: null,
                isBot: true,
                authProvider: 'password',
                hasSeenOnboarding: true,
                needsUsername: false,
                onboardingCompleted: true,
                preferences: { notifications: false, theme: 'system' },
                // Rules forbid changing createdAt, so it is only set when the profile is new.
                ...(existing.exists() ? {} : { createdAt: serverTimestamp() }),
            }, { merge: true });
        });
        return user.uid;
    });
}

export const botByUid = (uids: Record<string, string>, uid: string) => BOTS.find(b => uids[b.key] === uid);
