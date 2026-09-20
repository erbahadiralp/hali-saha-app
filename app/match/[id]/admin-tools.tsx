import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAlert } from '../../../components/CustomAlertProvider';
import { Avatar, PrimaryButton, SecondaryButton, Sheet, TextField, compactName } from '../../../components/group/GroupUI';
import { SettingsScreen, useSettingsColors } from '../../../components/settings/SettingsUI';
import { getMatchParticipants, isMatchFullError, joinMatch, updateUserProfile } from '../../../services/firestore';

/** Admin player ratings for a match; follows the shared settings layout and designTokens. */

const STATUS_LABELS: Record<string, string> = { IN: 'Kadroda', WAITLIST: 'Yedek', MAYBE: 'Belki', OUT: 'Gelmiyor' };

export default function AdminToolsScreen() {
    const { alert } = useAlert();
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    const [participants, setParticipants] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [ratings, setRatings] = useState<Record<string, { form?: string; skill?: string }>>({});
    const [showGuest, setShowGuest] = useState(false);
    const [guestName, setGuestName] = useState('');

    const loadParticipants = async () => {
        try {
            setParticipants(await getMatchParticipants(id));
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) loadParticipants();
    }, [id]);

    const setRating = (userId: string, key: 'form' | 'skill', value: string) =>
        setRatings(prev => ({ ...prev, [userId]: { ...prev[userId], [key]: value.replace(/[^0-9]/g, '') } }));

    const saveRatings = async () => {
        setSaving(true);
        try {
            await Promise.all(Object.entries(ratings).map(([userId, r]) => {
                const form = Math.min(100, parseInt(r.form || '', 10) || 50);
                const skill = Math.min(100, parseInt(r.skill || '', 10) || 50);
                return updateUserProfile(userId, { ratings: { form, skill, overall: Math.round((form + skill) / 2) } });
            }));
            alert('Kaydedildi', 'Puanlar güncellendi', [], { type: 'success' });
        } catch {
            alert('Hata', 'Puanlar güncellenemedi', [], { type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const addGuest = async () => {
        if (!guestName.trim()) return;
        try {
            await joinMatch(id, `guest_${Date.now()}`, `${guestName.trim()} (Misafir)`, 'IN');
            setShowGuest(false);
            setGuestName('');
            await loadParticipants();
        } catch (error) {
            console.error(error);
            alert('Hata', isMatchFullError(error) ? 'Maç dolu, misafir eklenemez.' : 'Misafir oyuncu eklenemedi', [], { type: 'error' });
        }
    };

    const ratingInput = (userId: string, key: 'form' | 'skill', label: string) => (
        <View style={st.ratingBox}>
            <Text style={[st.ratingLabel, { color: C.textTertiary }]}>{label}</Text>
            <TextInput
                value={ratings[userId]?.[key] ?? ''}
                onChangeText={v => setRating(userId, key, v)}
                keyboardType="number-pad"
                maxLength={3}
                placeholder="–"
                placeholderTextColor={C.placeholder}
                style={[st.ratingInput, { backgroundColor: C.input, borderColor: C.border, color: C.text }]}
            />
        </View>
    );

    return (
        <SettingsScreen
            title="Yönetici Paneli"
            headerRight={
                <TouchableOpacity onPress={() => setShowGuest(true)} style={[st.iconBtn, { backgroundColor: C.card, borderColor: C.border }]} accessibilityLabel="Misafir ekle">
                    <Ionicons name="person-add-outline" size={18} color={C.text} />
                </TouchableOpacity>
            }
        >
            {loading ? (
                <View style={st.center}><ActivityIndicator size="large" color={C.primaryText} /></View>
            ) : (
                <FlatList
                    data={participants}
                    keyExtractor={item => item.id}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
                    ListHeaderComponent={
                        <Text style={[st.intro, { color: C.textSecondary }]}>
                            Oyunculara 0–100 arası puan vererek kadroların otomatik dengelenmesine yardımcı olabilirsin.
                        </Text>
                    }
                    renderItem={({ item, index }) => (
                        <View style={[st.row, { borderBottomColor: C.divider }, index === participants.length - 1 && { borderBottomWidth: 0 }]}>
                            <Avatar name={item.name} size={36} />
                            <View style={{ flex: 1 }}>
                                <Text style={[st.name, { color: C.text }]} numberOfLines={1}>{compactName(item.name)}</Text>
                                <Text style={[st.status, { color: C.textSecondary }]}>{STATUS_LABELS[item.status] || item.status}</Text>
                            </View>
                            {ratingInput(item.userId, 'form', 'Form')}
                            {ratingInput(item.userId, 'skill', 'Yetenek')}
                        </View>
                    )}
                />
            )}

            <View style={[st.footer, { paddingBottom: insets.bottom + 12 }]}>
                <SecondaryButton label="Kadro Kurucu" icon="people-outline" onPress={() => router.push(`/match/${id}/team-builder`)} style={{ flex: 1 }} />
                <PrimaryButton label="Puanları Kaydet" onPress={saveRatings} disabled={saving} loading={saving ? <ActivityIndicator color={C.onPrimary} /> : undefined} style={{ flex: 1 }} />
            </View>

            <Sheet visible={showGuest} onClose={() => setShowGuest(false)} title="Misafir Oyuncu Ekle">
                <TextField value={guestName} onChangeText={setGuestName} placeholder="Oyuncu adı" autoFocus maxLength={30} onSubmitEditing={addGuest} />
                <PrimaryButton label="Ekle" onPress={addGuest} disabled={!guestName.trim()} style={{ marginTop: 12 }} />
            </Sheet>
        </SettingsScreen>
    );
}

const st = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    iconBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
    intro: { fontSize: 13, lineHeight: 19, marginBottom: 8 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1 },
    name: { fontSize: 14, fontWeight: '700' },
    status: { fontSize: 11.5, marginTop: 1 },
    ratingBox: { alignItems: 'center' },
    ratingLabel: { fontSize: 10, fontWeight: '700', marginBottom: 3 },
    ratingInput: { width: 50, height: 38, borderRadius: 10, borderWidth: 1, textAlign: 'center', fontSize: 14, fontWeight: '800' },
    footer: { flexDirection: 'row', gap: 10, paddingHorizontal: 16, paddingTop: 8 },
});
