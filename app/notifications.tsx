import { Ionicons } from '@expo/vector-icons';
import { formatDistanceToNow } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, LayoutAnimation, Platform, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, UIManager, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '../components/CustomAlertProvider';
import { SettingsScreen, useSettingsColors } from '../components/settings/SettingsUI';
import { SwipeActionRow } from '../components/ui/SwipeActionRow';
import { withOpacity } from '../constants/designTokens';
import { useAuth } from '../context/AuthContext';
import { acceptInvite, deleteNotification, getPendingInvites, getUserNotifications, getUserProfile, Invite, markAllNotificationsAsRead, markNotificationAsRead, Notification, rejectInvite, toggleNotificationRead } from '../services/firestore';

/**
 * Layout: design/tasarım/macvar-additional-screens.html (Bildirimler).
 * The design's Bildirimler/Davetler tabs are intentionally dropped: pending invites and
 * notifications share one list, and invites are answered inline.
 */

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
    UIManager.setLayoutAnimationEnabledExperimental(true);
}

const toDate = (value: any): Date | null => {
    if (!value) return null;
    if (typeof value.toDate === 'function') return value.toDate();
    return value instanceof Date ? value : new Date(value);
};

const timeAgo = (value: any) => {
    const date = toDate(value);
    return date ? formatDistanceToNow(date, { addSuffix: true, locale: tr }) : '';
};

export default function NotificationsScreen() {
    const { alert } = useAlert();
    const router = useRouter();
    const { user } = useAuth();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [invites, setInvites] = useState<Invite[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [processingInvite, setProcessingInvite] = useState<string | null>(null);

    const loadData = async () => {
        if (!user) return;
        try {
            const [notifs, invs] = await Promise.all([
                getUserNotifications(user.uid),
                getPendingInvites(user.uid),
            ]);
            setNotifications(notifs);
            setInvites(invs.sort((a, b) => (toDate(b.createdAt)?.getTime() ?? 0) - (toDate(a.createdAt)?.getTime() ?? 0)));
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    useFocusEffect(
        useCallback(() => {
            loadData();
        }, [user])
    );

    const openNotification = async (notif: Notification) => {
        if (!notif.read && notif.id) {
            setNotifications(prev => prev.map(n => (n.id === notif.id ? { ...n, read: true } : n)));
            markNotificationAsRead(notif.id).catch(console.error);
        }
        const relatedUserId = (notif as any).relatedUserId;
        if (notif.type === 'new_follower' && relatedUserId) router.push(`/user/${relatedUserId}`);
        else if (notif.matchId) router.push(`/match/${notif.matchId}`);
        else if (notif.groupId) router.push(`/group/${notif.groupId}`);
    };

    // The row has already animated out (SwipeActionRow); only the long-press menu path animates here.
    const handleDeleteNotification = async (notifId: string, animate = false) => {
        if (animate) LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
        setNotifications(prev => prev.filter(n => n.id !== notifId));
        try {
            await deleteNotification(notifId);
        } catch (error) {
            console.error(error);
            alert('Hata', 'Bildirim silinemedi', [], { type: 'error' });
            loadData();
        }
    };

    const handleToggleRead = async (notif: Notification) => {
        if (!notif.id) return;
        setNotifications(prev => prev.map(n => (n.id === notif.id ? { ...n, read: !n.read } : n)));
        try {
            await toggleNotificationRead(notif.id, notif.read);
        } catch (error) {
            console.error(error);
            loadData();
        }
    };

    const showNotificationActions = (notif: Notification) => {
        if (!notif.id) return;
        alert('Bildirim', notif.title, [
            { text: notif.read ? 'Okunmadı olarak işaretle' : 'Okundu olarak işaretle', onPress: () => handleToggleRead(notif) },
            { text: 'Sil', style: 'destructive', onPress: () => handleDeleteNotification(notif.id!, true) },
            { text: 'İptal', style: 'cancel' },
        ]);
    };

    const handleMarkAllAsRead = async () => {
        if (!user) return;
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        try {
            await markAllNotificationsAsRead(user.uid);
        } catch (error) {
            console.error(error);
            loadData();
        }
    };

    const handleAcceptInvite = async (invite: Invite) => {
        if (!invite.id || !user) return;
        setProcessingInvite(invite.id);
        try {
            const profile: any = await getUserProfile(user.uid);
            await acceptInvite(invite, profile?.displayName || 'Kullanıcı');
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setInvites(prev => prev.filter(i => i.id !== invite.id));
            const isGroup = invite.type === 'group';
            alert('Davet Kabul Edildi', `${invite.targetName} ${isGroup ? 'grubuna' : 'maçına'} katıldın!`, [
                { text: 'Tamam', style: 'cancel' },
                { text: 'Görüntüle', onPress: () => router.push(isGroup ? `/group/${invite.targetId}` : `/match/${invite.targetId}`) },
            ], { type: 'success' });
        } catch (error: any) {
            alert('Hata', error.message || 'Davet kabul edilemedi', [], { type: 'error' });
        } finally {
            setProcessingInvite(null);
        }
    };

    const handleRejectInvite = async (invite: Invite) => {
        if (!invite.id) return;
        setProcessingInvite(invite.id);
        try {
            await rejectInvite(invite.id);
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setInvites(prev => prev.filter(i => i.id !== invite.id));
        } catch (error: any) {
            alert('Hata', error.message || 'Davet reddedilemedi', [], { type: 'error' });
        } finally {
            setProcessingInvite(null);
        }
    };

    const notificationStyle = (type: Notification['type']): { icon: keyof typeof Ionicons.glyphMap; color: string } => {
        switch (type) {
            case 'match_reminder': return { icon: 'calendar-outline', color: C.link };
            case 'match_invite': return { icon: 'football-outline', color: C.link };
            case 'payment_reminder': return { icon: 'cash-outline', color: C.warning };
            case 'new_follower': return { icon: 'person-outline', color: C.textSecondary };
            default: return { icon: 'notifications-outline', color: C.textSecondary };
        }
    };

    const unreadCount = notifications.filter(n => !n.read).length;
    const isEmpty = invites.length === 0 && notifications.length === 0;

    const renderInvite = (invite: Invite) => {
        const isGroup = invite.type === 'group';
        const isProcessing = processingInvite === invite.id;
        return (
            <View key={`invite-${invite.id}`} style={[st.item, { borderBottomColor: C.divider }]}>
                <IconTile icon={isGroup ? 'people-outline' : 'football-outline'} color={C.link} />
                <View style={{ flex: 1 }}>
                    <Text style={[st.title, { color: C.text }]}>{isGroup ? 'Grup daveti' : 'Maç daveti'}</Text>
                    <Text style={[st.sub, { color: C.textSecondary }]}>
                        <Text style={{ color: C.text, fontWeight: '700' }}>{invite.fromUserName}</Text>
                        {' seni '}
                        <Text style={{ color: C.text, fontWeight: '700' }}>{invite.targetName}</Text>
                        {isGroup ? ' grubuna davet etti' : ' maçına davet etti'}
                    </Text>
                    <Text style={[st.time, { color: C.textTertiary }]}>{timeAgo(invite.createdAt)}</Text>

                    <View style={st.inviteActions}>
                        <TouchableOpacity
                            onPress={() => handleRejectInvite(invite)}
                            disabled={isProcessing}
                            activeOpacity={0.7}
                            style={[st.inviteBtn, { backgroundColor: C.card, borderColor: C.border, borderWidth: 1 }, isProcessing && st.dimmed]}
                        >
                            <Text style={[st.inviteBtnText, { color: C.error }]}>Reddet</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => handleAcceptInvite(invite)}
                            disabled={isProcessing}
                            activeOpacity={0.8}
                            style={[st.inviteBtn, { backgroundColor: C.primary }, isProcessing && st.dimmed]}
                        >
                            {isProcessing
                                ? <ActivityIndicator size="small" color={C.onPrimary} />
                                : <Text style={[st.inviteBtnText, { color: C.onPrimary }]}>Kabul Et</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
                <View style={[st.dot, { backgroundColor: C.link }]} />
            </View>
        );
    };

    const renderNotification = (notif: Notification) => {
        const { icon, color } = notificationStyle(notif.type);
        return (
            <SwipeActionRow
                key={notif.id}
                textColor={C.onPrimary}
                primary={{
                    icon: notif.read ? 'mail-unread-outline' : 'mail-open-outline',
                    label: notif.read ? 'Okunmadı' : 'Okundu',
                    color: C.primary,
                    onTrigger: () => handleToggleRead(notif),
                }}
                destructive={{
                    icon: 'trash-outline',
                    label: 'Sil',
                    color: C.error,
                    onTrigger: () => { if (notif.id) handleDeleteNotification(notif.id); },
                }}
            >
                <TouchableOpacity
                    onPress={() => openNotification(notif)}
                    onLongPress={() => showNotificationActions(notif)}
                    activeOpacity={0.7}
                    style={[st.item, { borderBottomColor: C.divider }]}
                >
                    <IconTile icon={icon} color={color} />
                    <View style={{ flex: 1 }}>
                        <Text style={[st.title, { color: C.text, fontWeight: notif.read ? '600' : '700' }]}>{notif.title}</Text>
                        {!!notif.body && <Text style={[st.sub, { color: C.textSecondary }]}>{notif.body}</Text>}
                        <Text style={[st.time, { color: C.textTertiary }]}>{timeAgo(notif.createdAt)}</Text>
                    </View>
                    {!notif.read && <View style={[st.dot, { backgroundColor: C.link }]} />}
                </TouchableOpacity>
            </SwipeActionRow>
        );
    };

    return (
        <SettingsScreen
            title="Bildirimler"
            headerRight={
                <TouchableOpacity
                    onPress={() => router.push('/settings/notifications')}
                    style={[st.roundBtn, { backgroundColor: C.card, borderColor: C.border }]}
                    accessibilityLabel="Bildirim ayarları"
                >
                    <Ionicons name="settings-outline" size={20} color={C.text} />
                </TouchableOpacity>
            }
        >
            {loading ? (
                <View style={st.center}>
                    <ActivityIndicator size="large" color={C.primaryText} />
                </View>
            ) : (
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24, flexGrow: 1 }}
                    showsVerticalScrollIndicator={false}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); loadData(); }} tintColor={C.primaryText} />}
                >
                    {unreadCount > 0 && (
                        <View style={st.markAllRow}>
                            <TouchableOpacity onPress={handleMarkAllAsRead} hitSlop={8}>
                                <Text style={[st.markAll, { color: C.link }]}>Tümünü Okundu İşaretle</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {isEmpty ? (
                        <View style={st.empty}>
                            <View style={[st.emptyIcon, { backgroundColor: C.iconTile }]}>
                                <Ionicons name="notifications-off-outline" size={28} color={C.textSecondary} />
                            </View>
                            <Text style={[st.emptyTitle, { color: C.text }]}>Bildirim yok</Text>
                            <Text style={[st.emptyText, { color: C.textSecondary }]}>
                                Davetler ve bildirimler burada görünecek. Maçlara katıl, arkadaşlarını takip et.
                            </Text>
                        </View>
                    ) : (
                        <>
                            {invites.map(renderInvite)}
                            {notifications.map(renderNotification)}
                        </>
                    )}
                </ScrollView>
            )}
        </SettingsScreen>
    );
}

function IconTile({ icon, color }: { icon: keyof typeof Ionicons.glyphMap; color: string }) {
    return (
        <View style={[st.iconTile, { backgroundColor: withOpacity(color, 0.15) }]}>
            <Ionicons name={icon} size={18} color={color} />
        </View>
    );
}

const st = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    roundBtn: { width: 44, height: 44, borderRadius: 22, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },

    markAllRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 4, paddingTop: 2, paddingBottom: 4 },
    markAll: { fontSize: 12.5, fontWeight: '700' },

    item: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingVertical: 14, paddingHorizontal: 4, borderBottomWidth: 1 },
    iconTile: { width: 40, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    title: { fontSize: 14.5, lineHeight: 20 },
    sub: { fontSize: 12.5, lineHeight: 18, marginTop: 3 },
    time: { fontSize: 11, marginTop: 6 },
    dot: { width: 8, height: 8, borderRadius: 4, marginTop: 6 },

    inviteActions: { flexDirection: 'row', gap: 10, marginTop: 12 },
    inviteBtn: { flex: 1, height: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
    inviteBtnText: { fontSize: 14, fontWeight: '700' },
    dimmed: { opacity: 0.5 },

    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingVertical: 60, gap: 8 },
    emptyIcon: { width: 60, height: 60, borderRadius: 18, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
    emptyTitle: { fontSize: 17, fontWeight: '800' },
    emptyText: { fontSize: 13, fontWeight: '500', textAlign: 'center', maxWidth: 270 },
});
