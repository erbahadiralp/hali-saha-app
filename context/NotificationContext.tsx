import { useRouter } from 'expo-router';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { ToastNotification } from '../components/ToastNotification';
import { db } from '../firebaseConfig';
import { getNotificationSettings } from '../services/notificationSettings';
import { useAuth } from './AuthContext';

interface ToastItem {
    message: string;
    type: 'info' | 'success' | 'error';
}

interface NotificationContextType {
    unreadCount: number;
    showToast: (message: string, type?: 'info' | 'success' | 'error') => void;
}

const NotificationContext = createContext<NotificationContextType>({
    unreadCount: 0,
    showToast: () => { },
});

export const useNotification = () => useContext(NotificationContext);

export const NotificationProvider = ({ children }: { children: React.ReactNode }) => {
    const { user } = useAuth();
    const router = useRouter();

    const [unreadNotifications, setUnreadNotifications] = useState(0);
    const [pendingInvites, setPendingInvites] = useState(0);

    // Toast Queue System
    const [toastVisible, setToastVisible] = useState(false);
    const [toastMessage, setToastMessage] = useState('');
    const [toastType, setToastType] = useState<'info' | 'success' | 'error'>('info');
    const toastQueue = useRef<ToastItem[]>([]);
    const isShowingToast = useRef(false);

    const processNextToast = useCallback(() => {
        if (toastQueue.current.length === 0) {
            isShowingToast.current = false;
            return;
        }

        const next = toastQueue.current.shift()!;
        isShowingToast.current = true;
        setToastMessage(next.message);
        setToastType(next.type);
        setToastVisible(true);
    }, []);

    const showToast = useCallback((message: string, type: 'info' | 'success' | 'error' = 'info') => {
        // Max queue size to prevent flooding
        if (toastQueue.current.length >= 5) {
            toastQueue.current.shift(); // Remove oldest
        }

        if (!isShowingToast.current) {
            isShowingToast.current = true;
            setToastMessage(message);
            setToastType(type);
            setToastVisible(true);
        } else {
            toastQueue.current.push({ message, type });
        }
    }, []);

    // One listener per collection feeds both the badge count and the toast for new arrivals;
    // the previous version opened each query twice.
    useEffect(() => {
        if (!user) {
            setUnreadNotifications(0);
            setPendingInvites(0);
            return;
        }

        // Anything created before the listeners attach is existing data, not a new arrival.
        const mountTime = new Date();

        const q = query(
            collection(db, "notifications"),
            where("userId", "==", user.uid),
            where("read", "==", false)
        );

        const unsubscribe = onSnapshot(q, async (snapshot) => {
            setUnreadNotifications(snapshot.size);
            const hasNewArrival = snapshot.docChanges().some(change => change.type === "added");
            if (!hasNewArrival) return;
            const settings = await getNotificationSettings();

            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const data = change.doc.data();
                    const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();

                    if (createdAt > mountTime && settings.enabled) {
                        // Check notification type against user settings
                        const notifType = data.type || '';
                        let shouldShow = true;

                        if (notifType.includes('match_reminder') || notifType.includes('reminder')) {
                            shouldShow = settings.matchReminder;
                        } else if (notifType.includes('invite') || notifType.includes('match_invite')) {
                            shouldShow = settings.matchInvite;
                        } else if (notifType.includes('payment') || notifType.includes('debt')) {
                            shouldShow = settings.paymentReminder;
                        } else if (notifType.includes('follow')) {
                            shouldShow = settings.followNotification;
                        }

                        if (shouldShow) {
                            showToast(data.body || data.title || 'Yeni bir bildiriminiz var!', 'info');
                        }
                    }
                }
            });
        });

        // Invites Toast Listener
        const qInv = query(
            collection(db, "invites"),
            where("toUserId", "==", user.uid),
            where("status", "==", "pending")
        );

        const unsubInv = onSnapshot(qInv, async (snapshot) => {
            setPendingInvites(snapshot.size);
            const hasNewArrival = snapshot.docChanges().some(change => change.type === "added");
            if (!hasNewArrival) return;
            const settings = await getNotificationSettings();

            snapshot.docChanges().forEach((change) => {
                if (change.type === "added") {
                    const data = change.doc.data();
                    const createdAt = data.createdAt?.toDate ? data.createdAt.toDate() : new Date();

                    if (createdAt > mountTime && settings.enabled && settings.matchInvite) {
                        const msg = data.type === 'match'
                            ? `${data.fromUserName} seni bir maça davet etti!`
                            : `${data.fromUserName} seni bir gruba davet etti!`;
                        showToast(msg, 'info');
                    }
                }
            });
        });

        return () => {
            unsubscribe();
            unsubInv();
        };
    }, [user]);

    const unreadCount = unreadNotifications + pendingInvites;

    return (
        <NotificationContext.Provider value={{ unreadCount, showToast }}>
            {children}
            <ToastNotification
                visible={toastVisible}
                message={toastMessage}
                type={toastType}
                onHide={() => {
                    setToastVisible(false);
                    // Process next toast in queue after a short delay
                    setTimeout(() => processNextToast(), 300);
                }}
                onPress={() => {
                    router.push('/notifications');
                }}
            />
        </NotificationContext.Provider>
    );
};
