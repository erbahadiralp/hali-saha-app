import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { getNotifications } from './notificationRuntime';
import { doc, updateDoc } from 'firebase/firestore';
import { Platform } from 'react-native';
import { db } from '../firebaseConfig';

/**
 * Register for push notifications and save token to Firestore
 * @param userId - The user's Firebase UID
 * @returns The Expo push token or null if failed
 */
export async function registerForPushNotificationsAsync(userId?: string): Promise<string | null> {
    let token: string | null = null;

    // Skip in Expo Go - push notifications not supported
    const Notifications = getNotifications();
    if (!Notifications) {
        console.log('Push notifications not supported in Expo Go');
        return null;
    }

    // Check if it's a physical device
    if (!Device.isDevice) {
        console.log('Push notifications require a physical device');
        return null;
    }

    // Configure Android channel
    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'Varsayılan',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#10B981',
        });

        await Notifications.setNotificationChannelAsync('match-reminders', {
            name: 'Maç Hatırlatmaları',
            importance: Notifications.AndroidImportance.HIGH,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#10B981',
        });

        await Notifications.setNotificationChannelAsync('social', {
            name: 'Sosyal Bildirimler',
            importance: Notifications.AndroidImportance.DEFAULT,
        });
    }

    // Check existing permissions
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    // Request permissions if not granted
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }

    if (finalStatus !== 'granted') {
        console.log('Failed to get push token - permission denied');
        return null;
    }

    try {
        // Get the project ID from Constants
        const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

        if (!projectId) {
            console.log('No project ID found in Constants');
            return null;
        }

        // Get the Expo push token
        const pushTokenResponse = await Notifications.getExpoPushTokenAsync({
            projectId,
        });
        token = pushTokenResponse.data;

        console.log('Push token:', token);

        // Save token to Firestore if userId is provided
        if (userId && token) {
            await savePushTokenToFirestore(userId, token);
        }
    } catch (error) {
        console.error('Error getting push token:', error);
        return null;
    }

    return token;
}

/**
 * Save push token to Firestore user document
 */
async function savePushTokenToFirestore(userId: string, token: string): Promise<void> {
    try {
        const userRef = doc(db, 'users', userId);
        await updateDoc(userRef, {
            pushToken: token,
            pushTokenUpdatedAt: new Date(),
        });
        console.log('Push token saved to Firestore');
    } catch (error) {
        console.error('Error saving push token:', error);
    }
}

/**
 * Schedule a local notification (for match reminders)
 */
export async function scheduleMatchReminder(
    matchId: string,
    matchTitle: string,
    matchDate: Date,
    reminderMinutesBefore: number
): Promise<string | null> {
    const Notifications = getNotifications();
    if (!Notifications) return null;

    const triggerDate = new Date(matchDate.getTime() - reminderMinutesBefore * 60 * 1000);

    // Don't schedule if the reminder time has passed
    if (triggerDate <= new Date()) {
        console.log('Reminder time has already passed');
        return null;
    }

    try {
        const notificationId = await Notifications.scheduleNotificationAsync({
            content: {
                title: '⚽ Maç Hatırlatması',
                body: `${matchTitle} maçına ${reminderMinutesBefore} dakika kaldı!`,
                data: { matchId, type: 'match_reminder' },
                sound: true,
            },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.DATE,
                date: triggerDate,
            },
        });

        console.log('Match reminder scheduled:', notificationId);
        return notificationId;
    } catch (error) {
        console.error('Error scheduling notification:', error);
        return null;
    }
}

/**
 * Cancel a scheduled notification
 */
export async function cancelScheduledNotification(notificationId: string): Promise<void> {
    const Notifications = getNotifications();
    if (!Notifications) return;
    try {
        await Notifications.cancelScheduledNotificationAsync(notificationId);
        console.log('Notification cancelled:', notificationId);
    } catch (error) {
        console.error('Error cancelling notification:', error);
    }
}

/**
 * Cancel all scheduled notifications for a specific match
 */
export async function cancelMatchReminders(matchId: string): Promise<void> {
    const Notifications = getNotifications();
    if (!Notifications) return;
    const scheduled = await Notifications.getAllScheduledNotificationsAsync();

    for (const notification of scheduled) {
        if ((notification.content.data as any)?.matchId === matchId) {
            await cancelScheduledNotification(notification.identifier);
        }
    }
}

/**
 * Send a push notification via Expo's push service
 * Note: For production, this should be done from a backend/Cloud Function
 */
export async function sendPushNotification(
    expoPushToken: string,
    title: string,
    body: string,
    data?: Record<string, unknown>
): Promise<void> {
    const message = {
        to: expoPushToken,
        sound: 'default',
        title,
        body,
        data: data || {},
    };

    try {
        await fetch('https://exp.host/--/api/v2/push/send', {
            method: 'POST',
            headers: {
                Accept: 'application/json',
                'Accept-encoding': 'gzip, deflate',
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(message),
        });
    } catch (error) {
        console.error('Error sending push notification:', error);
    }
}

/**
 * Get notification permission status
 */
export async function getNotificationPermissionStatus(): Promise<'granted' | 'denied' | 'undetermined'> {
    const Notifications = getNotifications();
    if (!Notifications) return 'undetermined';
    const { status } = await Notifications.getPermissionsAsync();
    return status;
}

/**
 * Request notification permissions
 */
export async function requestNotificationPermissions(): Promise<boolean> {
    const Notifications = getNotifications();
    if (!Notifications) return false;
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
}
