import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  writeBatch
} from 'firebase/firestore';
import { auth, db } from '../firebaseConfig';

export interface Notification {
  id?: string;
  userId: string;
  senderId?: string; // Add sender field for security rules
  fromUserId?: string; // Add alias for older rules
  title: string;
  body: string;
  type: 'match_reminder' | 'match_invite' | 'payment_reminder' | 'general' | 'new_follower';
  matchId?: string;
  groupId?: string;
  read: boolean;
  createdAt: any;
}

export const saveNotification = async (notification: Omit<Notification, 'id' | 'createdAt'>) => {
  try {
    const sender = auth.currentUser?.uid;
    const dataToSave = {
      ...notification,
      senderId: notification.senderId || sender,
      fromUserId: notification.fromUserId || notification.senderId || sender,
      createdAt: serverTimestamp()
    };

    // Remove undefined fields to avoid Firestore errors
    Object.keys(dataToSave).forEach(key => dataToSave[key as keyof typeof dataToSave] === undefined && delete dataToSave[key as keyof typeof dataToSave]);

    const notificationRef = await addDoc(collection(db, "notifications"), dataToSave);
    return notificationRef.id;
  } catch (error) {
    console.error("Error saving notification: ", error);
    throw error;
  }
};

export const getUserNotifications = async (userId: string, limit = 50) => {
  try {
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", userId)
    );
    const querySnapshot = await getDocs(q);

    const notifications = querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      createdAt: doc.data().createdAt?.toDate ? doc.data().createdAt.toDate() : new Date()
    })) as Notification[];

    // Sort by createdAt descending (newest first)
    notifications.sort((a, b) => {
      const dateA = a.createdAt instanceof Date ? a.createdAt.getTime() : 0;
      const dateB = b.createdAt instanceof Date ? b.createdAt.getTime() : 0;
      return dateB - dateA;
    });

    return notifications.slice(0, limit);
  } catch (error) {
    console.error("Error fetching notifications: ", error);
    throw error;
  }
};

export const markNotificationAsRead = async (notificationId: string) => {
  try {
    const notificationRef = doc(db, "notifications", notificationId);
    await updateDoc(notificationRef, { read: true });
  } catch (error) {
    console.error("Error marking notification as read: ", error);
    throw error;
  }
};

export const deleteNotification = async (notificationId: string) => {
  try {
    const notificationRef = doc(db, "notifications", notificationId);
    await deleteDoc(notificationRef);
  } catch (error) {
    console.error("Error deleting notification: ", error);
    throw error;
  }
};

export const toggleNotificationRead = async (notificationId: string, currentRead: boolean) => {
  try {
    const notificationRef = doc(db, "notifications", notificationId);
    await updateDoc(notificationRef, { read: !currentRead });
  } catch (error) {
    console.error("Error toggling notification read status: ", error);
    throw error;
  }
};

export const markAllNotificationsAsRead = async (userId: string) => {
  try {
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      where("read", "==", false)
    );
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) return;

    const batch = writeBatch(db);
    querySnapshot.docs.forEach((docSnap) => {
      batch.update(docSnap.ref, { read: true });
    });

    await batch.commit();
  } catch (error) {
    console.error("Error marking all notifications as read: ", error);
    throw error;
  }
};

export const getUnreadNotificationCount = async (userId: string) => {
  try {
    const q = query(
      collection(db, "notifications"),
      where("userId", "==", userId),
      where("read", "==", false)
    );
    const querySnapshot = await getDocs(q);
    return querySnapshot.size;
  } catch (error) {
    console.error("Error getting unread count: ", error);
    return 0;
  }
};
