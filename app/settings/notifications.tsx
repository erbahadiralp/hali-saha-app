import AsyncStorage from '@react-native-async-storage/async-storage';
import { getNotifications } from '../../services/notificationRuntime';
import { useEffect, useState } from 'react';
import {
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SectionLabel, SettingsRow, SettingsScreen, Toggle, useSettingsColors } from '../../components/settings/SettingsUI';
import { useAuth } from '../../context/AuthContext';
import { getUserMatches } from '../../services/firestore';
import { rescheduleAllReminders } from '../../services/notificationSettings';

const NOTIFICATION_SETTINGS_KEY = '@notification_settings';

interface NotificationSettings {
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

export default function NotificationSettingsScreen() {
    const { user } = useAuth();
    const insets = useSafeAreaInsets();
    const C = useSettingsColors();
    const [settings, setSettings] = useState<NotificationSettings>(DEFAULT_SETTINGS);

    useEffect(() => {
        loadSettings();
    }, []);

    const loadSettings = async () => {
        try {
            const stored = await AsyncStorage.getItem(NOTIFICATION_SETTINGS_KEY);
            if (stored) {
                const parsed = JSON.parse(stored);
                // Migrate old format (single number to array)
                if (parsed.reminderHours && !Array.isArray(parsed.reminderHours)) {
                    parsed.reminderHours = [parsed.reminderHours];
                }
                // Migrate from old reminderTime format
                if (parsed.reminderTime && !parsed.reminderHours) {
                    const timeMap: Record<string, number> = { '24h': 24, '6h': 6, '1h': 1 };
                    parsed.reminderHours = [timeMap[parsed.reminderTime] || 1];
                    delete parsed.reminderTime;
                }
                setSettings({ ...DEFAULT_SETTINGS, ...parsed });
            }
        } catch (error) {
            console.error('Failed to load notification settings:', error);
        }
    };

    const saveSettings = async (newSettings: NotificationSettings) => {
        try {
            await AsyncStorage.setItem(NOTIFICATION_SETTINGS_KEY, JSON.stringify(newSettings));
            setSettings(newSettings);

            // If match reminder or hours changed, reschedule all match reminders
            if (
                newSettings.enabled !== settings.enabled ||
                newSettings.matchReminder !== settings.matchReminder ||
                JSON.stringify(newSettings.reminderHours) !== JSON.stringify(settings.reminderHours)
            ) {
                if (!newSettings.enabled || !newSettings.matchReminder) {
                    // Disabled - cancel all match reminders
                    const Notifications = getNotifications();
                    if (!Notifications) return;
                    const scheduled = await Notifications.getAllScheduledNotificationsAsync();
                    for (const n of scheduled) {
                        if ((n.content.data as any)?.type === 'match_reminder') {
                            await Notifications.cancelScheduledNotificationAsync(n.identifier);
                        }
                    }
                } else if (user) {
                    // Reschedule with new hours
                    try {
                        const userMatches = await getUserMatches(user.uid);
                        const upcomingMatches = userMatches
                            .filter((m: any) => {
                                const d = m.date instanceof Date ? m.date : new Date(m.date);
                                return d > new Date() && m.status !== 'FINISHED';
                            })
                            .map((m: any) => ({
                                id: m.id,
                                venue: (m as any).venue || 'Maç',
                                date: m.date instanceof Date ? m.date : new Date(m.date)
                            }));
                        await rescheduleAllReminders(upcomingMatches);
                    } catch (err) {
                        console.error('Failed to reschedule reminders:', err);
                    }
                }
            }
        } catch (error) {
            console.error('Failed to save notification settings:', error);
        }
    };

    const updateSetting = <K extends keyof NotificationSettings>(key: K, value: NotificationSettings[K]) => {
        const newSettings = { ...settings, [key]: value };
        saveSettings(newSettings);
    };

    const toggleHour = (hour: number) => {
        const current = settings.reminderHours || [];
        let newHours: number[];

        if (current.includes(hour)) {
            // Remove hour, but keep at least one selected
            newHours = current.filter(h => h !== hour);
            if (newHours.length === 0) newHours = [hour]; // Keep at least one
        } else {
            // Add hour
            newHours = [...current, hour].sort((a, b) => a - b);
        }

        updateSetting('reminderHours', newHours);
    };

    const quickHourOptions = [1, 2, 3, 6, 12, 24];

    const isMasterDisabled = !settings.enabled;
    const isReminderDisabled = isMasterDisabled || !settings.matchReminder;

    const categories: { key: 'matchReminder' | 'matchInvite' | 'paymentReminder' | 'followNotification'; label: string }[] = [
        { key: 'matchReminder', label: 'Maç Hatırlatmaları' },
        { key: 'matchInvite', label: 'Maç Davetleri' },
        { key: 'paymentReminder', label: 'Ödeme Hatırlatmaları' },
        { key: 'followNotification', label: 'Takip Bildirimleri' },
    ];

    return (
        <SettingsScreen title="Bildirimler">
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
                showsVerticalScrollIndicator={false}
            >
                <SettingsRow
                    icon="notifications-outline"
                    label="Tüm Bildirimler"
                    right={<Toggle value={settings.enabled} onValueChange={(value) => updateSetting('enabled', value)} />}
                    last
                />

                <SectionLabel>Kategoriler</SectionLabel>
                {categories.map((cat, i) => (
                    <SettingsRow
                        key={cat.key}
                        label={cat.label}
                        disabled={isMasterDisabled}
                        last={i === categories.length - 1}
                        right={
                            <Toggle
                                value={settings[cat.key] && settings.enabled}
                                onValueChange={(value) => updateSetting(cat.key, value)}
                                disabled={isMasterDisabled}
                            />
                        }
                    />
                ))}

                <View style={isReminderDisabled && st.disabled}>
                    <SectionLabel>Maçtan Önce Hatırlat</SectionLabel>
                    <Text style={[st.helper, { color: C.textSecondary }]}>Birden fazla süre seçebilirsin</Text>
                    <View style={st.chips}>
                        {quickHourOptions.map(hour => {
                            const isSelected = settings.reminderHours?.includes(hour);
                            return (
                                <TouchableOpacity
                                    key={hour}
                                    onPress={() => toggleHour(hour)}
                                    disabled={isReminderDisabled}
                                    activeOpacity={0.7}
                                    accessibilityRole="checkbox"
                                    accessibilityState={{ checked: !!isSelected, disabled: isReminderDisabled }}
                                    style={[st.chip, { backgroundColor: isSelected ? C.primary : C.iconTile, borderColor: isSelected ? C.primary : C.border }]}
                                >
                                    <Text style={[st.chipText, { color: isSelected ? C.onPrimary : C.textSecondary }]}>
                                        {hour} saat
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>
            </ScrollView>
        </SettingsScreen>
    );
}

const st = StyleSheet.create({
    helper: {
        fontSize: 12,
        fontWeight: '600',
        marginLeft: 4,
        marginBottom: 12,
    },
    chips: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    chip: {
        paddingVertical: 8,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: 1,
    },
    chipText: {
        fontSize: 13,
        fontWeight: '700',
    },
    disabled: {
        opacity: 0.45,
    },
});
