import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  arrayUnion
} from 'firebase/firestore';
import { db } from '../firebaseConfig';
import { joinGroup } from './groupService';
import { joinMatch } from './matchService';

export interface Invite {
  id?: string;
  type: 'group' | 'match';
  targetId: string;
  targetName: string;
  fromUserId: string;
  fromUserName: string;
  toUserId: string;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: any;
}

export const groupInviteId = (groupId: string, toUserId: string) => `group_${groupId}_${toUserId}`;

export const sendGroupInvite = async (
  groupId: string,
  groupName: string,
  fromUserId: string,
  fromUserName: string,
  toUserId: string
) => {
  try {
    // One invite per group and invitee: security rules look this id up to let the invitee join a
    // private group, and a second pending invite from another member is detected here.
    const inviteRef = doc(db, "invites", groupInviteId(groupId, toUserId));
    const existing = await getDoc(inviteRef);
    if (existing.exists() && existing.data().status === 'pending') {
      throw new Error("Davet zaten gönderilmiş");
    }

    await setDoc(inviteRef, {
      type: 'group',
      targetId: groupId,
      targetName: groupName,
      fromUserId,
      fromUserName,
      toUserId,
      status: 'pending',
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error sending group invite: ", error);
    throw error;
  }
};

export const sendMatchInvite = async (
  matchId: string,
  matchName: string,
  fromUserId: string,
  fromUserName: string,
  toUserId: string
) => {
  try {
    // Check if invite already exists
    const existingQuery = query(
      collection(db, "invites"),
      where("type", "==", "match"),
      where("targetId", "==", matchId),
      where("fromUserId", "==", fromUserId),
      where("toUserId", "==", toUserId),
      where("status", "==", "pending")
    );
    const existingSnap = await getDocs(existingQuery);
    if (!existingSnap.empty) {
      throw new Error("Davet zaten gönderilmiş");
    }

    await addDoc(collection(db, "invites"), {
      type: 'match',
      targetId: matchId,
      targetName: matchName,
      fromUserId,
      fromUserName,
      toUserId,
      status: 'pending',
      createdAt: serverTimestamp()
    });
  } catch (error) {
    console.error("Error sending match invite: ", error);
    throw error;
  }
};

export const getPendingInvites = async (userId: string): Promise<Invite[]> => {
  try {
    const q = query(
      collection(db, "invites"),
      where("toUserId", "==", userId),
      where("status", "==", "pending")
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Invite[];
  } catch (error) {
    console.error("Error getting pending invites: ", error);
    return [];
  }
};

export const acceptInvite = async (invite: Invite, acceptingUserName: string) => {
  try {
    if (!invite.id) throw new Error("Invite ID missing");

    if (invite.type === 'group') {
      const groupRef = doc(db, "groups", invite.targetId);
      const inviteRef = doc(db, "invites", invite.id);

      await runTransaction(db, async (transaction) => {
        const gDoc = await transaction.get(groupRef);
        if (!gDoc.exists()) throw new Error("Grup bulunamadı");

        const groupData = gDoc.data();
        const members = groupData.members || [];
        if (members.length >= 50) {
          throw new Error("Grup üye sayısı sınırına (50) ulaşıldı.");
        }

        transaction.update(inviteRef, { status: 'accepted' });
        if (!members.includes(invite.toUserId)) {
          transaction.update(groupRef, {
            members: arrayUnion(invite.toUserId)
          });
        }
      });
    } else if (invite.type === 'match') {
      const inviteRef = doc(db, "invites", invite.id);
      await updateDoc(inviteRef, { status: 'accepted' });
      await joinMatch(invite.targetId, invite.toUserId, acceptingUserName, 'IN');
    }
  } catch (error) {
    console.error("Error accepting invite: ", error);
    throw error;
  }
};

export const rejectInvite = async (inviteId: string) => {
  try {
    const inviteRef = doc(db, "invites", inviteId);
    await updateDoc(inviteRef, { status: 'rejected' });
  } catch (error) {
    console.error("Error rejecting invite: ", error);
    throw error;
  }
};

export const getPendingInviteCount = async (userId: string): Promise<number> => {
  try {
    const q = query(
      collection(db, "invites"),
      where("toUserId", "==", userId),
      where("status", "==", "pending")
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  } catch (error) {
    console.error("Error getting invite count: ", error);
    return 0;
  }
};
