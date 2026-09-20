import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNotifications } from './notificationRuntime';
import { scheduleMatchReminder, cancelMatchReminders } from './pushNotifications';

const NOTIFICATION_SETTINGS_KEY = '@notification_settings';

export interface NotificationSettings {
    enabled: boolean;
    matchReminder: boolean;
    matchInvite: boolean;
    paymentReminder: boolean;
    followNotification: boolean;
    reminderHours: number[];
}

const DEFAULT_SETTINGS: NotificationSettings = {
    enabled: true,
    matchReminder: true,
    matchInvite: true,
    paymentReminder: true,
    followNotification: true,
    reminderHours: [1]
};

/**
 * Load notification settings from AsyncStorage
 */
export async function getNotificationSettings(): Promise<NotificationSettings> {
    try {
        const stored = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
        if (stored) {
            const parsed = JSON.parse(stored);
            // Migrate old formats
            if (parsed.reminderHours && !Array.isArray(parsed.reminderHours)) {
                parsed.reminderHours = [parsed.reminderHours];
            }
            if (parsed.reminderTime && !parsed.reminderHours) {
                const timeMap: Record<string, number> = { '24h': 24, '6h': 6, '1h': 1 };
                parsed.reminderHours = [timeMap[parsed.reminderTime] || 1];
                delete parsed.reminderTime;
            }
            return { ...DEFAULT_SETTINGS, ...parsed };
        }
        return DEFAULT_SETTINGS;
    } catch (error) {
        console.error('Failed to load notification settings:', error);
        return DEFAULT_SETTINGS;
    }
}

/**
 * Check if a specific notification type is enabled
 */
export async function isNotificationEnabled(type: 'matchReminder' | 'matchInvite' | 'paymentReminder' | 'followNotification'): Promise<boolean> {
    const settings = await getNotificationSettings();
    if (!settings.enabled) return false;
    return settings[type] === true;
}

/**
 * Schedule match reminders based on user's settings
 * This should be called when a user joins a match or when reminder settings change
 */
export async function scheduleMatchReminders(
    matchId: string,
    matchTitle: string,
    matchDate: Date
): Promise<void> {
    try {
        const settings = await getNotificationSettings();

        // Check if reminders are enabled
        if (!settings.enabled || !settings.matchReminder) {
            // Cancel any existing reminders for this match
            await cancelMatchReminders(matchId);
            return;
        }

        // Cancel existing reminders first (to avoid duplicates)
        await cancelMatchReminders(matchId);

        // Schedule reminders for each selected hour
        const reminderHours = settings.reminderHours || [1];

        for (const hours of reminderHours) {
            const minutesBefore = hours * 60;
            const triggerDate = new Date(matchDate.getTime() - minutesBefore * 60 * 1000);

            // Don't schedule if the reminder time has already passed
            if (triggerDate <= new Date()) continue;

            await scheduleMatchReminder(matchId, matchTitle, matchDate, minutesBefore);
        }
    } catch (error) {
        console.error('Error scheduling match reminders:', error);
    }
}

/**
 * Reschedule all match reminders (call when settings change)
 * Takes an array of active matches the user is participating in
 */
export async function rescheduleAllReminders(
    matches: Array<{ id: string; venue: string; date: Date }>
): Promise<void> {
    try {
        // Cancel all existing scheduled notifications with match_reminder type
        const Notifications = getNotifications();
        if (!Notifications) return;
        const scheduled = await Notifications.getAllScheduledNotificationsAsync();
        for (const n of scheduled) {
            if ((n.content.data as any)?.type === 'match_reminder') {
                await Notifications.cancelScheduledNotificationAsync(n.identifier);
            }
        }

        // Re-schedule based on current settings
        for (const match of matches) {
            if (match.date > new Date()) {
                await scheduleMatchReminders(match.id, match.venue || 'Maç', match.date);
            }
        }
    } catch (error) {
        console.error('Error rescheduling all reminders:', error);
    }
}
