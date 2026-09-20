import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

// Profiles are requested by many screens at once (rosters, member lists, invites). A short-lived
// cache with in-flight de-duplication avoids repeating identical reads and piling up copies in memory.
const PROFILE_TTL_MS = 30 * 1000;
const PROFILE_CACHE_MAX = 300;
const profileCache = new Map<string, { at: number; value: any }>();
const profileInFlight = new Map<string, Promise<any>>();

/** Drop cached profiles after a write so the next read is fresh. Omit the id to clear everything. */
export const invalidateUserProfile = (userId?: string) => {
  if (userId) profileCache.delete(userId);
  else profileCache.clear();
};

export const getUserProfile = async (userId: string, options: { fresh?: boolean } = {}) => {
  const cached = profileCache.get(userId);
  if (!options.fresh && cached && Date.now() - cached.at < PROFILE_TTL_MS) return cached.value;
  const pending = profileInFlight.get(userId);
  if (pending) return pending;

  const request = (async () => {
    try {
      const docSnap = await getDoc(doc(db, "users", userId));
      const value = docSnap.exists() ? { uid: userId, ...docSnap.data() } : null;
      if (profileCache.size >= PROFILE_CACHE_MAX) {
        profileCache.delete(profileCache.keys().next().value as string);
      }
      profileCache.set(userId, { at: Date.now(), value });
      return value;
    } catch (error) {
      console.error("Error fetching user profile: ", error);
      throw error;
    } finally {
      profileInFlight.delete(userId);
    }
  })();
  profileInFlight.set(userId, request);
  return request;
};

export const searchUsersByUsername = async (username: string, maxResults = 10) => {
  try {
    // Search for users where username contains the search term (case-insensitive would need Cloud Functions)
    const q = query(
      collection(db, "users"),
      where("username", ">=", username.toLowerCase()),
      where("username", "<=", username.toLowerCase() + '\uf8ff')
    );
    const querySnapshot = await getDocs(q);
    // Accounts waiting for deletion are hidden from search.
    return querySnapshot.docs
      .filter(doc => !doc.data().isDeleted)
      .slice(0, maxResults)
      .map(doc => ({
        uid: doc.id,
        ...doc.data()
      }));
  } catch (error) {
    console.error("Error searching users by username: ", error);
    return [];
  }
};

export const getUserByUsername = async (username: string) => {
  try {
    const normalizedUsername = username.toLowerCase();

    // First try the public 'usernames' collection (allows unauthenticated reads)
    const usernameDocRef = doc(db, "usernames", normalizedUsername);
    const usernameDocSnap = await getDoc(usernameDocRef);

    if (usernameDocSnap.exists()) {
      const data = usernameDocSnap.data();
      // If email is stored in usernames doc, return it directly
      if (data.email) {
        return { uid: data.uid, email: data.email };
      }
      // If no email in usernames doc, try to get from users collection
      if (data.uid) {
        try {
          const userDoc = await getDoc(doc(db, "users", data.uid));
          if (userDoc.exists()) {
            return { uid: data.uid, ...userDoc.data() as any };
          }
        } catch (e) {
          // Firestore rules may block unauthenticated reads on users collection
          console.warn("Could not read user doc (possibly unauthenticated):", e);
        }
      }
      // Return uid only if that's all we have
      return { uid: data.uid };
    }

    // Fallback: query users collection (may require authentication based on Firestore rules)
    try {
      const q = query(
        collection(db, "users"),
        where("username", "==", normalizedUsername)
      );
      const querySnapshot = await getDocs(q);
      if (!querySnapshot.empty) {
        const docSnap = querySnapshot.docs[0];
        return { uid: docSnap.id, ...docSnap.data() as any };
      }
    } catch (e) {
      console.warn("Could not query users collection:", e);
    }

    return null;
  } catch (error) {
    console.error("Error getting user by username: ", error);
    return null;
  }
};

export const searchUserByEmail = async (email: string) => {
  try {
    const q = query(
      collection(db, "users"),
      where("email", "==", email.toLowerCase())
    );
    const querySnapshot = await getDocs(q);
    const doc = querySnapshot.docs.find(d => !d.data().isDeleted);
    if (!doc) return null;
    return { uid: doc.id, ...doc.data() };
  } catch (error) {
    console.error("Error searching user by email: ", error);
    return null;
  }
};

// Allowed fields for user profile updates (whitelist approach)
const ALLOWED_USER_FIELDS = [
  // 'username' is intentionally absent: it changes only through claimUsername (atomic with its reservation).
  'displayName', 'photoURL', 'position', 'bio',
  'city', 'district', 'birthDate',
  'pushToken', 'pushTokenUpdatedAt', 'onboardingCompleted',
  'skillLevel', 'archetype', 'preferredFoot', 'height', 'weight',
  'selectedFrame', 'cardTheme', 'nickname'
];

export const updateUserProfile = async (userId: string, data: any) => {
  try {
    // Sanitize input - only allow known fields
    const sanitizedData: any = {};
    for (const key of Object.keys(data)) {
      if (ALLOWED_USER_FIELDS.includes(key)) {
        sanitizedData[key] = data[key];
      }
    }

    // Validate string fields aren't too long
    if (sanitizedData.displayName && typeof sanitizedData.displayName === 'string') {
      sanitizedData.displayName = sanitizedData.displayName.trim().substring(0, 50);
    }
    if (sanitizedData.username && typeof sanitizedData.username === 'string') {
      sanitizedData.username = sanitizedData.username.trim().toLowerCase().substring(0, 30);
    }
    if (sanitizedData.nickname && typeof sanitizedData.nickname === 'string') {
      sanitizedData.nickname = sanitizedData.nickname.trim().substring(0, 50);
    }
    if (sanitizedData.bio && typeof sanitizedData.bio === 'string') {
      sanitizedData.bio = sanitizedData.bio.trim().substring(0, 500);
    }

    const docRef = doc(db, "users", userId);
    await updateDoc(docRef, sanitizedData);
    invalidateUserProfile(userId);
  } catch (error) {
    console.error("Error updating user profile: ", error);
    throw error;
  }
};

export const isUsernameAvailable = async (username: string, currentUserId?: string): Promise<boolean> => {
  try {
    const normalizedUsername = username.toLowerCase();
    const currentUser = auth.currentUser;

    if (!currentUser) {
      // Not authenticated (registration flow) - use the public 'usernames' collection
      const usernameDoc = doc(db, "usernames", normalizedUsername);
      const docSnap = await getDoc(usernameDoc);
      return !docSnap.exists();
    }

    // Authenticated - query the users collection
    const q = query(
      collection(db, "users"),
      where("username", "==", normalizedUsername)
    );
    const querySnapshot = await getDocs(q);
    if (querySnapshot.empty) return true;
    // If taken by current user, it's still "available"
    if (currentUserId && querySnapshot.docs[0].id === currentUserId) return true;
    return false;
  } catch (error) {
    console.error("Error checking username availability: ", error);
    return false;
  }
};

export const canChangeUsername = async (userId: string): Promise<{ allowed: boolean; daysRemaining: number }> => {
  try {
    const docRef = doc(db, "users", userId);
    const docSnap = await getDoc(docRef);
    if (!docSnap.exists()) return { allowed: true, daysRemaining: 0 };

    const data = docSnap.data();
    const lastChange = data.lastUsernameChange;
    if (!lastChange) return { allowed: true, daysRemaining: 0 };

    const lastChangeDate = lastChange.toDate ? lastChange.toDate() : new Date(lastChange);
    const now = new Date();
    // Use UTC-based day diff to avoid timezone-related 30-day drift
    const utcLast = Date.UTC(lastChangeDate.getFullYear(), lastChangeDate.getMonth(), lastChangeDate.getDate());
    const utcNow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const diffDays = Math.floor((utcNow - utcLast) / (1000 * 60 * 60 * 24));

    if (diffDays >= 30) {
      return { allowed: true, daysRemaining: 0 };
    }
    return { allowed: false, daysRemaining: 30 - diffDays };
  } catch (error) {
    console.error("Error checking username change limit: ", error);
    return { allowed: true, daysRemaining: 0 };
  }
};

export const getLevelDetails = (xp: number = 0) => {
  const level = Math.floor(xp / 1000) + 1;
  const currentLevelXp = xp % 1000;
  const nextLevelXp = 1000;

  let rank = "Halı Saha Çaylağı";
  if (level >= 25) rank = "Halı Saha Profesörü";
  else if (level >= 20) rank = "Semt Efsanesi";
  else if (level >= 15) rank = "Orta Saha Şefi";
  else if (level >= 10) rank = "Kadro Değişmezi";
  else if (level >= 5) rank = "Semt Yıldızı";

  return {
    level,
    currentLevelXp,
    nextLevelXp,
    rank,
    progress: currentLevelXp / nextLevelXp
  };
};

// Profile counters (stats.*, matchesPlayed, xp) are owned by the `recomputeUserStats` Cloud Function,
// which rebuilds them from match_participants. The client never increments them.

export const saveFCMToken = async (userId: string, token: string) => {
  try {
    const docRef = doc(db, "users", userId);
    await updateDoc(docRef, {
      fcmToken: token,
      fcmTokenUpdatedAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error saving FCM token: ", error);
    throw error;
  }
};

export async function updateUserCardTheme(userId: string, theme: string): Promise<void> {
  try {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { cardTheme: theme });
  } catch (error) {
    console.error('Error updating card theme:', error);
    throw error;
  }
}

