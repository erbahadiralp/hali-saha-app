import {
  Firestore,
  addDoc,
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';
import { getUserProfile } from './userService';
import { checkAndPromoteWaitlist } from './matchService';

export const createGroup = async (
  name: string,
  city: string,
  district: string,
  imageUrl: string | null,
  adminId: string,
  privacy: 'public' | 'private' = 'public'
) => {
  try {
    // Sanitize inputs
    const sanitizedName = (name || '').trim().substring(0, 100);
    const sanitizedCity = (city || '').trim().substring(0, 50);
    const sanitizedDistrict = (district || '').trim().substring(0, 50);

    if (!sanitizedName) throw new Error("Grup adı boş olamaz");
    if (!adminId) throw new Error("Admin ID gerekli");

    const docRef = await addDoc(collection(db, "groups"), {
      name: sanitizedName,
      city: sanitizedCity,
      district: sanitizedDistrict,
      imageUrl,
      adminId,
      admins: [adminId],
      members: [adminId],
      privacy: privacy === 'private' ? 'private' : 'public',
      createdAt: serverTimestamp(),
    });
    console.log("Group created with ID: ", docRef.id);
    return docRef.id;
  } catch (error) {
    console.error("Error adding group: ", error);
    throw error;
  }
};

export const addGroupAdmin = async (groupId: string, userId: string) => {
  try {
    const groupRef = doc(db, "groups", groupId);
    await updateDoc(groupRef, {
      admins: arrayUnion(userId)
    });
  } catch (error) {
    console.error("Error adding group admin: ", error);
    throw error;
  }
};

export const removeGroupAdmin = async (groupId: string, userId: string, currentAdminId: string) => {
  try {
    // Can't remove the original admin
    const groupDoc = await getDoc(doc(db, "groups", groupId));
    if (!groupDoc.exists()) throw new Error("Grup bulunamadı");

    const groupData = groupDoc.data();
    if (groupData.adminId === userId) {
      throw new Error("Grup kurucusu adminlikten çıkarılamaz");
    }

    // Only admins can remove other admins
    const admins = groupData.admins || [groupData.adminId];
    if (!admins.includes(currentAdminId)) {
      throw new Error("Bu işlem için yetkiniz yok");
    }

    // Remove from admins array
    const newAdmins = admins.filter((id: string) => id !== userId);
    await updateDoc(doc(db, "groups", groupId), { admins: newAdmins });
  } catch (error) {
    console.error("Error removing group admin: ", error);
    throw error;
  }
};

export const removeGroupMember = async (groupId: string, memberId: string, currentAdminId: string) => {
  try {
    const groupDoc = await getDoc(doc(db, "groups", groupId));
    if (!groupDoc.exists()) throw new Error("Grup bulunamadı");

    const groupData = groupDoc.data();

    // Check if current user is admin
    const admins = groupData.admins || [groupData.adminId];
    if (!admins.includes(currentAdminId)) {
      throw new Error("Bu işlem için sadece yöneticiler yetkilidir");
    }

    // Cannot remove the group owner
    if (groupData.adminId === memberId) {
      throw new Error("Grup kurucusu gruptan çıkarılamaz");
    }

    // Remove from members array
    await updateDoc(doc(db, "groups", groupId), {
      members: arrayRemove(memberId),
      // Also remove from admins if they were an admin
      admins: arrayRemove(memberId)
    });

    // Cascade removal to all upcoming matches of the group
    const matchesQuery = query(
      collection(db, "matches"),
      where("groupId", "==", groupId),
      where("status", "==", "UPCOMING")
    );
    const matchesSnapshot = await getDocs(matchesQuery);

    for (const matchDoc of matchesSnapshot.docs) {
      if (matchDoc.data().isDeleted) continue;
      const matchId = matchDoc.id;
      const participantRef = doc(db, "match_participants", `${matchId}_${memberId}`);
      const participantSnap = await getDoc(participantRef);

      if (participantSnap.exists()) {
        const participantData = participantSnap.data();
        const oldStatus = participantData.status;

        if (oldStatus === 'IN') {
          // Update status to OUT
          await updateDoc(participantRef, {
            status: 'OUT',
            team: null,
            teamIndex: null,
            updatedAt: serverTimestamp()
          });

          // Decrement match playerCount
          const matchRef = doc(db, "matches", matchId);
          await runTransaction(db, async (transaction) => {
            const mDoc = await transaction.get(matchRef);
            if (mDoc.exists()) {
              const currentCount = mDoc.data().playerCount || 0;
              transaction.update(matchRef, {
                playerCount: Math.max(0, currentCount - 1)
              });
            }
          });

          // Promote the next person from waitlist
          await checkAndPromoteWaitlist(matchId);
        } else {
          // Just update status to OUT
          await updateDoc(participantRef, {
            status: 'OUT',
            team: null,
            teamIndex: null,
            updatedAt: serverTimestamp()
          });
        }
      }
    }
  } catch (error) {
    console.error("Error removing group member: ", error);
    throw error;
  }
};

/** Synchronous check on already-loaded group data: the founder and everyone in `admins`. */
export const isAdminOfGroup = (group: any, userId?: string | null): boolean =>
  !!group && !!userId && (group.adminId === userId || (group.admins || []).includes(userId));

export const isGroupAdmin = async (groupId: string, userId: string): Promise<boolean> => {
  try {
    const groupDoc = await getDoc(doc(db, "groups", groupId));
    if (!groupDoc.exists()) return false;

    const groupData = groupDoc.data();
    const admins = groupData.admins || [groupData.adminId];
    return admins.includes(userId) || groupData.adminId === userId;
  } catch (error) {
    console.error("Error checking admin status: ", error);
    return false;
  }
};

export const deleteGroup = async (groupId: string) => {
  try {
    // Orphan matches instead of deleting them (preserve player stats)
    const matchesQuery = query(collection(db, "matches"), where("groupId", "==", groupId));
    const matchesSnapshot = await getDocs(matchesQuery);

    // Also clean up related group_requests
    const requestsQuery = query(collection(db, "group_requests"), where("groupId", "==", groupId));
    const requestsSnapshot = await getDocs(requestsQuery);

    // Firestore batches have a limit of 500 operations
    // Process in chunks to be safe
    const allOps: Array<{ type: 'update' | 'delete'; ref: any; data?: any }> = [];

    matchesSnapshot.docs.forEach((matchDoc) => {
      allOps.push({
        type: 'update',
        ref: doc(db, "matches", matchDoc.id),
        data: {
          groupId: null,
          orphanedFromGroup: groupId,
          orphanedAt: serverTimestamp()
        }
      });
    });

    // Delete all pending group requests
    requestsSnapshot.docs.forEach((reqDoc) => {
      allOps.push({ type: 'delete', ref: doc(db, "group_requests", reqDoc.id) });
    });

    // Delete the group itself
    allOps.push({ type: 'delete', ref: doc(db, "groups", groupId) });

    // Process in batches of 450 (safe under 500 limit)
    const BATCH_SIZE = 450;
    for (let i = 0; i < allOps.length; i += BATCH_SIZE) {
      const chunk = allOps.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(db);

      chunk.forEach((op) => {
        if (op.type === 'update') {
          batch.update(op.ref, op.data);
        } else {
          batch.delete(op.ref);
        }
      });

      await batch.commit();
    }

    return true;
  } catch (error) {
    console.error("Error deleting group: ", error);
    throw error;
  }
};

export const getUserGroups = async (userId: string) => {
  try {
    const q = query(collection(db, "groups"), where("members", "array-contains", userId));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs
      .map(doc => ({ id: doc.id, ...doc.data() }))
      .filter((group: any) => !group.isDeleted);
  } catch (error) {
    console.error("Error getting user groups: ", error);
    return [];
  }
};

export const getGroupDetails = async (groupId: string) => {
  try {
    const docRef = doc(db, "groups", groupId);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data() };
    } else {
      console.log("No such document!");
      return null;
    }
  } catch (error) {
    console.error("Error fetching group details: ", error);
    throw error;
  }
};

export const getGroupMembers = async (groupId: string) => {
  try {
    const groupDoc = await getDoc(doc(db, "groups", groupId));
    if (!groupDoc.exists()) return [];

    const groupData = groupDoc.data();
    const memberIds = groupData.members || [];

    // Fetch profiles for all members
    const memberProfiles = await Promise.all(
      memberIds.map(async (memberId: string) => {
        const profile = await getUserProfile(memberId);
        return profile ? { odaylarId: memberId, ...profile } : null;
      })
    );

    return memberProfiles.filter(Boolean);
  } catch (error) {
    console.error("Error fetching group members: ", error);
    throw error;
  }
};

export const updateGroup = async (groupId: string, data: any) => {
  try {
    const whitelist = ['name', 'description', 'photoURL', 'privacy', 'members', 'admins'];
    const filteredData: any = {};
    Object.keys(data).forEach((key) => {
      if (whitelist.includes(key)) {
        filteredData[key] = data[key];
      }
    });

    if (Object.keys(filteredData).length === 0) {
      console.warn("No whitelisted fields provided to updateGroup");
      return;
    }

    const docRef = doc(db, "groups", groupId);
    await updateDoc(docRef, filteredData);
  } catch (error) {
    console.error("Error updating group: ", error);
    throw error;
  }
};

export const joinGroup = async (groupId: string, userId: string, { firestore = db }: { firestore?: Firestore } = {}) => {
  try {
    const docRef = doc(firestore, "groups", groupId);
    await runTransaction(firestore, async (transaction) => {
      const gDoc = await transaction.get(docRef);
      if (!gDoc.exists()) throw new Error("Grup bulunamadı");
      const groupData = gDoc.data();
      const members = groupData.members || [];
      if (members.length >= 50) {
        throw new Error("Grup üye sayısı sınırına (50) ulaşıldı.");
      }
      if (!members.includes(userId)) {
        transaction.update(docRef, {
          members: arrayUnion(userId)
        });
      }
    });
  } catch (error) {
    console.error("Error joining group: ", error);
    throw error;
  }
};

export const removeFromGroup = async (groupId: string, userId: string) => {
  try {
    const docRef = doc(db, "groups", groupId);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      throw new Error("Group not found");
    }

    const groupData = docSnap.data();
    const updatedMembers = (groupData.members || []).filter((m: string) => m !== userId);

    await updateDoc(docRef, {
      members: updatedMembers,
      admins: arrayRemove(userId)
    });
  } catch (error) {
    console.error("Error removing from group: ", error);
    throw error;
  }
};

// --- Group Join Requests ---

export const checkJoinRequestStatus = async (groupId: string, userId: string): Promise<'pending' | 'none'> => {
  try {
    const q = query(
      collection(db, "group_requests"),
      where("groupId", "==", groupId),
      where("userId", "==", userId),
      where("status", "==", "pending")
    );
    const snapshot = await getDocs(q);
    return snapshot.empty ? 'none' : 'pending';
  } catch (error) {
    console.error("Error checking join request status: ", error);
    return 'none';
  }
};

export const requestToJoinGroup = async (groupId: string, userId: string, { firestore = db }: { firestore?: Firestore } = {}) => {
  try {
    // Check existing
    const status = await checkJoinRequestStatus(groupId, userId);
    if (status === 'pending') return;

    const batch = writeBatch(firestore);

    // Add request
    const requestRef = doc(collection(firestore, "group_requests"));
    batch.set(requestRef, {
      groupId,
      userId,
      status: 'pending',
      createdAt: serverTimestamp()
    });

    // Notify Group Admins
    const groupDoc = await getDoc(doc(db, "groups", groupId));
    if (groupDoc.exists()) {
      const groupData = groupDoc.data();
      // Use admins array if available, fallback to adminId
      const adminIds = groupData.admins && groupData.admins.length > 0 ? groupData.admins : [groupData.adminId];

      const userProfile = await getUserProfile(userId);
      const userName = (userProfile as any)?.displayName || 'Bir kullanıcı';

      adminIds.forEach((adminId: string) => {
        if (adminId) {
          const notificationRef = doc(collection(firestore, "notifications"));
          batch.set(notificationRef, {
            userId: adminId,
            senderId: userId,
            fromUserId: userId,
            type: 'general',
            title: 'Grup Katılım İsteği',
            body: `${userName} "${groupData.name}" grubuna katılmak istiyor.`,
            read: false,
            groupId: groupId,
            relatedUserId: userId,
            createdAt: serverTimestamp()
          });
        }
      });
    }

    await batch.commit();
  } catch (error) {
    console.error("Error requesting to join group: ", error);
    throw error;
  }
};

export const getGroupRequests = async (groupId: string) => {
  try {
    const q = query(
      collection(db, "group_requests"),
      where("groupId", "==", groupId),
      where("status", "==", "pending")
    );
    const snapshot = await getDocs(q);

    // Fetch user details for each request
    const requests = await Promise.all(snapshot.docs.map(async (docSnap) => {
      const data = docSnap.data();
      const userProfile = await getUserProfile(data.userId);
      return {
        id: docSnap.id,
        uid: data.userId, // Use uid for consistency
        ...data,
        user: userProfile
      };
    }));

    return requests;
  } catch (error) {
    console.error("Error getting group requests: ", error);
    return [];
  }
};

export const respondToGroupRequest = async (requestId: string, groupId: string, userId: string, action: 'approve' | 'reject') => {
  try {
    if (action === 'approve') {
      await runTransaction(db, async (transaction) => {
        const reqRef = doc(db, "group_requests", requestId);
        const groupRef = doc(db, "groups", groupId);

        const gDoc = await transaction.get(groupRef);
        if (!gDoc.exists()) throw new Error("Grup bulunamadı");

        const groupData = gDoc.data();
        const members = groupData.members || [];
        if (members.length >= 50) {
          throw new Error("Grup üye sayısı sınırına (50) ulaşıldı.");
        }

        transaction.update(reqRef, { status: 'accepted' });
        transaction.update(groupRef, {
          members: arrayUnion(userId)
        });

        // Notify User
        const sender = auth.currentUser?.uid;
        const notificationRef = doc(collection(db, "notifications"));
        transaction.set(notificationRef, {
          userId: userId,
          senderId: sender,
          fromUserId: sender,
          type: 'general',
          title: 'İstek Onaylandı',
          body: `"${groupData.name}" grubuna katılım isteğin onaylandı.`,
          read: false,
          groupId: groupId,
          createdAt: serverTimestamp()
        });
      });
    } else {
      const reqRef = doc(db, "group_requests", requestId);
      await updateDoc(reqRef, { status: 'rejected' });
    }
  } catch (error) {
    console.error("Error responding to group request: ", error);
    throw error;
  }
};

export async function getGroupPlayerRating(groupId: string, userId: string): Promise<{ rating: number; archetype: string | null; skillLevel: number } | null> {
  try {
    const groupRef = doc(db, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);

    if (!groupDoc.exists()) return null;

    const groupData = groupDoc.data();
    const memberDetails = groupData.memberDetails || [];

    const member = memberDetails.find((m: any) => m.uid === userId);
    if (member && member.skillLevel) {
      // (member.skillLevel * 6) + 40 base overall
      const baseOverall = Math.round(member.skillLevel * 6 + 40);
      const rating = Math.min(99, Math.max(40, baseOverall));
      return {
        rating,
        archetype: member.archetype || null,
        skillLevel: member.skillLevel
      };
    }

    return null;
  } catch (error) {
    console.error('Error getting group player rating:', error);
    return null;
  }
}

export async function updateGroupMemberDetails(
  groupId: string,
  userId: string,
  skillLevel: number,
  archetype: string
): Promise<void> {
  try {
    const groupRef = doc(db, 'groups', groupId);
    const groupDoc = await getDoc(groupRef);

    if (!groupDoc.exists()) return;

    const groupData = groupDoc.data();
    const memberDetails = groupData.memberDetails || [];

    // Update the specific member's data
    let found = false;
    const updatedMemberDetails = memberDetails.map((m: any) => {
      if (m.uid === userId) {
        found = true;
        return { ...m, skillLevel, archetype };
      }
      return m;
    });

    // If member not found in array, add them
    if (!found) {
      updatedMemberDetails.push({ uid: userId, skillLevel, archetype });
    }

    const baseOverall = Math.round(skillLevel * 6 + 40);
    const cappedOverall = Math.min(99, Math.max(40, baseOverall));

    await updateDoc(groupRef, {
      memberDetails: updatedMemberDetails,
      [`memberRatings.${userId}`]: cappedOverall
    });
  } catch (error) {
    console.error('Error updating group member details:', error);
    throw error;
  }
}

export const transferAdminAndLeaveGroup = async (groupId: string, currentAdminId: string, newAdminId: string) => {
  try {
    const groupRef = doc(db, "groups", groupId);
    await runTransaction(db, async (transaction) => {
      const gDoc = await transaction.get(groupRef);
      if (!gDoc.exists()) throw new Error("Grup bulunamadı");

      const groupData = gDoc.data();
      if (groupData.adminId !== currentAdminId) {
        throw new Error("Sadece grup kurucusu adminliği devredebilir.");
      }

      const members = groupData.members || [];
      if (!members.includes(newAdminId)) {
        throw new Error("Seçilen kullanıcı bu grubun üyesi değil.");
      }

      const updatedMembers = members.filter((m: string) => m !== currentAdminId);
      const admins = groupData.admins || [];
      
      // Filter out leaving admin and ensure successor is in the admins array
      let updatedAdmins = admins.filter((a: string) => a !== currentAdminId);
      if (!updatedAdmins.includes(newAdminId)) {
        updatedAdmins.push(newAdminId);
      }

      transaction.update(groupRef, {
        adminId: newAdminId,
        admins: updatedAdmins,
        members: updatedMembers
      });
    });
  } catch (error) {
    console.error("Error transferring admin and leaving group: ", error);
    throw error;
  }
};
