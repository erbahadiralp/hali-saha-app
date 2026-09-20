import Constants, { ExecutionEnvironment } from 'expo-constants';
import { Platform } from 'react-native';

type NotificationsModule = typeof import('expo-notifications');
let notifications: NotificationsModule | undefined;

// Never evaluate expo-notifications in Expo Go: its native push registration
// can fail during import, preventing Expo Router from loading any consumers.
export function getNotifications(): NotificationsModule | null {
    if (Platform.OS === 'web' || Constants.executionEnvironment === ExecutionEnvironment.StoreClient) {
        return null;
    }
    if (!notifications) {
        notifications = require('expo-notifications') as NotificationsModule;
        notifications.setNotificationHandler({
            handleNotification: async () => ({
                shouldPlaySound: true,
                shouldSetBadge: true,
                shouldShowBanner: true,
                shouldShowList: true,
            }),
        });
    }
    return notifications;
}
