import {
  collection,
  doc,
  getDoc,
  getDocs,
  increment,
  query,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { getUserProfile, invalidateUserProfile } from './userService';

export const followUser = async (currentUserId: string, targetUserId: string, currentUserName: string) => {
  try {
    if (currentUserId === targetUserId) {
      throw new Error("Kendinizi takip edemezsiniz.");
    }

    // 0. Check if already following to prevent duplicate counters
    const followingRef = doc(db, "users", currentUserId, "following", targetUserId);
    const existingDoc = await getDoc(followingRef);
    if (existingDoc.exists()) {
      return;
    }

    const batch = writeBatch(db);

    // 1. Add to current user's 'following' subcollection
    batch.set(followingRef, {
      uid: targetUserId,
      createdAt: serverTimestamp()
    });

    // 2. Add to target user's 'followers' subcollection
    const followerRef = doc(db, "users", targetUserId, "followers", currentUserId);
    batch.set(followerRef, {
      uid: currentUserId,
      createdAt: serverTimestamp()
    });

    // 3. Increment following count for current user
    const currentUserRef = doc(db, "users", currentUserId);
    batch.update(currentUserRef, {
      followingCount: increment(1)
    });

    // 4. Increment followers count for target user
    const targetUserRef = doc(db, "users", targetUserId);
    batch.update(targetUserRef, {
      followersCount: increment(1)
    });

    // 5. Create Notification for target user
    const notificationRef = doc(collection(db, "notifications"));
    batch.set(notificationRef, {
      userId: targetUserId,
      senderId: currentUserId,
      fromUserId: currentUserId,
      type: 'new_follower',
      title: 'Yeni Takipçi',
      body: `${currentUserName} seni takip etmeye başladı.`,
      read: false,
      relatedUserId: currentUserId,
      createdAt: serverTimestamp()
    });

    await batch.commit();
    invalidateUserProfile(currentUserId);
    invalidateUserProfile(targetUserId);
  } catch (error) {
    console.error("Error following user: ", error);
    throw error;
  }
};

export const unfollowUser = async (currentUserId: string, targetUserId: string) => {
  try {
    const followingRef = doc(db, "users", currentUserId, "following", targetUserId);
    const existingDoc = await getDoc(followingRef);
    if (!existingDoc.exists()) {
      return;
    }

    const batch = writeBatch(db);

    // 1. Remove from current user's 'following' subcollection
    batch.delete(followingRef);

    // 2. Remove from target user's 'followers' subcollection
    const followerRef = doc(db, "users", targetUserId, "followers", currentUserId);
    batch.delete(followerRef);

    const currentUserRef = doc(db, "users", currentUserId);
    const targetUserRef = doc(db, "users", targetUserId);

    // Fetch current counts to prevent negative values
    const currentUserSnap = await getDoc(currentUserRef);
    const targetUserSnap = await getDoc(targetUserRef);

    const currentUserData = currentUserSnap.exists() ? currentUserSnap.data() as any : null;
    const targetUserData = targetUserSnap.exists() ? targetUserSnap.data() as any : null;

    const currentFollowingCount = currentUserData ? (currentUserData.followingCount || 0) : 0;
    const targetFollowersCount = targetUserData ? (targetUserData.followersCount || 0) : 0;

    // 3. Decrement following count for current user (min 0)
    batch.update(currentUserRef, {
      followingCount: Math.max(0, currentFollowingCount - 1)
    });

    // 4. Decrement followers count for target user (min 0)
    batch.update(targetUserRef, {
      followersCount: Math.max(0, targetFollowersCount - 1)
    });

    await batch.commit();
    invalidateUserProfile(currentUserId);
    invalidateUserProfile(targetUserId);
  } catch (error) {
    console.error("Error unfollowing user: ", error);
    throw error;
  }
};

export const checkIfFollowing = async (currentUserId: string, targetUserId: string): Promise<boolean> => {
  try {
    const docRef = doc(db, "users", currentUserId, "following", targetUserId);
    const docSnap = await getDoc(docRef);
    return docSnap.exists();
  } catch (error) {
    console.error("Error checking follow status: ", error);
    return false;
  }
};

export const getFollowers = async (userId: string) => {
  try {
    const q = query(collection(db, "users", userId, "followers"));
    const snapshot = await getDocs(q);
    const followerIds = snapshot.docs.map(doc => doc.id);

    // Fetch user profiles for these IDs
    const profiles = await Promise.all(followerIds.map(id => getUserProfile(id)));
    return profiles.filter((p: any) => p !== null && !p.isDeleted);
  } catch (error) {
    console.error("Error getting followers: ", error);
    return [];
  }
};

export const getFollowing = async (userId: string) => {
  try {
    const q = query(collection(db, "users", userId, "following"));
    const snapshot = await getDocs(q);
    const followingIds = snapshot.docs.map(doc => doc.id);

    // Fetch user profiles for these IDs
    const profiles = await Promise.all(followingIds.map(id => getUserProfile(id)));
    return profiles.filter((p: any) => p !== null && !p.isDeleted);
  } catch (error) {
    console.error("Error getting following: ", error);
    return [];
  }
};

export const getMutualFollowers = async (userId: string) => {
  try {
    const followingQ = query(collection(db, "users", userId, "following"));
    const followersQ = query(collection(db, "users", userId, "followers"));

    const [followingSnap, followersSnap] = await Promise.all([
      getDocs(followingQ),
      getDocs(followersQ)
    ]);

    const followingIds = new Set(followingSnap.docs.map(doc => doc.id));
    const mutualIds = followersSnap.docs.map(doc => doc.id).filter(id => followingIds.has(id));

    if (mutualIds.length === 0) return [];

    // Fetch user profiles for mutual IDs
    const profiles = await Promise.all(mutualIds.map(id => getUserProfile(id)));
    return profiles.filter((p: any) => p !== null && !p.isDeleted);
  } catch (error) {
    console.error("Error getting mutual followers: ", error);
    return [];
  }
};
