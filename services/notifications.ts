import { getNotifications } from './notificationRuntime';
import { Platform } from 'react-native';


export async function requestNotificationPermissions() {
    const Notifications = getNotifications();
    if (!Notifications) return false;
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
    }
    return finalStatus === 'granted';
}

export async function scheduleNotification(title: string, body: string, triggerDate: Date, identifier?: string, data?: Record<string, any>) {
    const Notifications = getNotifications();
    if (!Notifications) return;
    const seconds = Math.floor((triggerDate.getTime() - Date.now()) / 1000);
    if (seconds <= 0) return; // Don't schedule for past

    if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
            name: 'default',
            importance: Notifications.AndroidImportance.MAX,
            vibrationPattern: [0, 250, 250, 250],
            lightColor: '#FF231F7C',
        });
    }

    await Notifications.scheduleNotificationAsync({
        content: {
            title,
            body,
            sound: true,
            data: data || {},
        },
        trigger: {
            type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
            seconds: seconds,
            repeats: false,
            channelId: 'default',
        },
        identifier
    });
}

export async function scheduleVotingStartNotification(matchId: string, matchDate: Date) {
    const matchEnd = new Date(matchDate.getTime() + 90 * 60 * 1000); // estimated match end
    const triggerDate = new Date(matchEnd.getTime() + 10 * 60 * 1000); // +10 min after match end (stats period over)
    await scheduleNotification(
        "MVP Oylaması Başladı! 🗳️",
        "Maçın yıldızını seçme zamanı geldi. Hemen oyunu kullan!",
        triggerDate,
        `${matchId}_start`,
        { url: `halisahaapp://match/${matchId}/mvp-vote` }
    );
}

export async function scheduleVotingEndNotification(matchId: string, matchDate: Date) {
    const matchEnd = new Date(matchDate.getTime() + 90 * 60 * 1000); // estimated match end
    const triggerDate = new Date(matchEnd.getTime() + 31 * 60 * 1000); // +31 min after match end (voting closes)
    await scheduleNotification(
        "MVP Oylaması Sonuçlandı! 🏆",
        "Kazanan belli oldu. Sonuçları görmek için tıkla.",
        triggerDate,
        `${matchId}_end`,
        { url: `halisahaapp://match/${matchId}/mvp-vote` }
    );
}

// ─── NOTIFICATION_RULES: Match Reminders ───

/**
 * Schedule 1-hour before match reminder
 * "Bugün maçın var! Saha: X, Saat: Y"
 */
export async function scheduleMatchReminder1Hour(matchId: string, matchDate: Date, venue: string) {
    const triggerDate = new Date(matchDate.getTime() - 60 * 60 * 1000); // -1 hour
    const timeStr = matchDate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
    await scheduleNotification(
        "Bugün maçın var! ⚽",
        `Saha: ${venue}, Saat: ${timeStr}`,
        triggerDate,
        `${matchId}_1h`
    );
}

/**
 * Schedule 15-minute before match reminder
 * "Maçın başlamak üzere!"
 */
export async function scheduleMatchReminder15Min(matchId: string, matchDate: Date) {
    const triggerDate = new Date(matchDate.getTime() - 15 * 60 * 1000); // -15 min
    await scheduleNotification(
        "Maçın başlamak üzere! 🏃",
        "Hazır ol, birazdan başlıyoruz!",
        triggerDate,
        `${matchId}_15m`
    );
}

// ─── NOTIFICATION_RULES: Stats Deadline ───

/**
 * Schedule stats deadline reminder (3 hours before deadline)
 * "İstatistiklerini girmek için 3 saatin var!"
 */
export async function scheduleStatsDeadlineReminder(matchId: string, matchDate: Date) {
    // Stats entry notification: fires right when match ends (~90 min after start)
    const matchEnd = new Date(matchDate.getTime() + 90 * 60 * 1000);

    await scheduleNotification(
        "İstatistik Girişi Açıldı! 📊",
        "Maç bitti! İstatistiklerini girmek için 10 dakikan var.",
        matchEnd,
        `${matchId}_stats_entry`,
        { url: `halisahaapp://match/${matchId}/post-match` }
    );
}

// ─── NOTIFICATION_RULES: Admin Stat Changes ───

/**
 * Notify player when admin changes their stats
 * "Adminin istatistiğini güncelledi."
 */
export async function scheduleAdminStatChangeNotification(
    field: string,
    oldValue: number,
    newValue: number
) {
    const fieldNames: Record<string, string> = {
        goals: 'gol',
        assists: 'asist',
        saves: 'kurtarış',
        cards: 'kart',
        ownGoals: 'kendi kalesine gol'
    };
    const fieldName = fieldNames[field] || field;

    // This fires immediately (no delay)
    await scheduleNotification(
        "İstatistik Güncellemesi 📊",
        `Admin ${fieldName} sayını değiştirdi: ${oldValue} → ${newValue}`,
        new Date(Date.now() + 1000), // 1 second delay (minimum)
        `stat_change_${Date.now()}`
    );
}

// ─── NOTIFICATION_RULES: Social ───

/**
 * Notify user of new follower
 */
export async function scheduleNewFollowerNotification(followerName: string) {
    await scheduleNotification(
        "Yeni Takipçi! 🎉",
        `${followerName} seni takip etmeye başladı.`,
        new Date(Date.now() + 1000),
        `follower_${Date.now()}`
    );
}

/**
 * Schedule all match-related notifications at once
 * Called when user joins a match
 */
export async function scheduleAllMatchNotifications(matchId: string, matchDate: Date, venue: string) {
    await Promise.all([
        scheduleMatchReminder1Hour(matchId, matchDate, venue),
        scheduleMatchReminder15Min(matchId, matchDate),
        scheduleVotingStartNotification(matchId, matchDate),
        scheduleVotingEndNotification(matchId, matchDate),
        scheduleStatsDeadlineReminder(matchId, matchDate),
    ]);
}

