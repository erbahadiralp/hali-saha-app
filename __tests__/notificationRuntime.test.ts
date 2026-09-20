jest.mock('expo-constants', () => ({
    __esModule: true,
    default: { executionEnvironment: 'storeClient' },
    ExecutionEnvironment: { StoreClient: 'storeClient' },
}));
jest.mock('expo-notifications', () => {
    throw new Error('Native notifications must not load in Expo Go');
});
jest.mock('expo-device', () => ({ isDevice: true }));
jest.mock('@react-native-async-storage/async-storage', () => ({
    __esModule: true,
    default: { getItem: jest.fn(), setItem: jest.fn() },
}));

beforeEach(() => jest.resetModules());

test('Expo Go can import and call notification services without loading native notifications', async () => {
    const push = require('../services/pushNotifications');
    const local = require('../services/notifications');
    const settings = require('../services/notificationSettings');
    const future = new Date(Date.now() + 3600000);
    await expect(push.registerForPushNotificationsAsync('user')).resolves.toBeNull();
    await expect(push.scheduleMatchReminder('match', 'Match', future, 5)).resolves.toBeNull();
    await expect(push.cancelScheduledNotification('id')).resolves.toBeUndefined();
    await expect(push.cancelMatchReminders('match')).resolves.toBeUndefined();
    await expect(push.getNotificationPermissionStatus()).resolves.toBe('undetermined');
    await expect(push.requestNotificationPermissions()).resolves.toBe(false);
    await expect(local.requestNotificationPermissions()).resolves.toBe(false);
    await expect(local.scheduleNotification('Title', 'Body', future)).resolves.toBeUndefined();
    await expect(settings.rescheduleAllReminders([])).resolves.toBeUndefined();
});

test('web never loads native notifications', () => {
    require('expo-constants').default.executionEnvironment = 'standalone';
    require('react-native').Platform.OS = 'web';
    expect(require('../services/notificationRuntime').getNotifications()).toBeNull();
});

test('development builds load notifications lazily and configure the handler once', () => {
    const setNotificationHandler = jest.fn();
    jest.doMock('expo-notifications', () => ({ setNotificationHandler }));
    require('expo-constants').default.executionEnvironment = 'bare';
    require('react-native').Platform.OS = 'android';
    const { getNotifications } = require('../services/notificationRuntime');
    expect(setNotificationHandler).not.toHaveBeenCalled();
    expect(getNotifications()).toBe(getNotifications());
    expect(setNotificationHandler).toHaveBeenCalledTimes(1);
});
