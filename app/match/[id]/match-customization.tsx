import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '../../../components/CustomAlertProvider';
import { Eyebrow, PrimaryButton, TextField } from '../../../components/group/GroupUI';
import { SettingsScreen, useSettingsColors } from '../../../components/settings/SettingsUI';
import { withOpacity } from '../../../constants/designTokens';
import { useAuth } from '../../../context/AuthContext';
import { usePremium } from '../../../context/PremiumContext';
import { db } from '../../../firebaseConfig';
import { isGroupAdmin } from '../../../services/firestore';

/** Captain customisations for a single match; follows the shared settings layout and designTokens. */

// Labels match the participation buttons on the match screen: Katıl (IN), Yedeklere Geç (WAITLIST), Çık (OUT).
const DEFAULTS = { teamAName: 'Takım A', teamBName: 'Takım B', yesText: 'Katıl', maybeText: 'Yedeklere Geç', noText: 'Çık' };

export default function MatchCustomizationScreen() {
    const { alert } = useAlert();
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const { user } = useAuth();
    const { canCustomizeMatch } = usePremium();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [teamAName, setTeamAName] = useState('');
    const [teamBName, setTeamBName] = useState('');
    const [yesText, setYesText] = useState('');
    const [maybeText, setMaybeText] = useState('');
    const [noText, setNoText] = useState('');

    const hasAccess = canCustomizeMatch(id);

    useEffect(() => {
        if (!id) return;
        (async () => {
            try {
                const snap = await getDoc(doc(db, 'matches', id));
                if (!snap.exists()) {
                    alert('Hata', 'Maç bulunamadı.', [], { type: 'error' });
                    router.back();
                    return;
                }
                const data = snap.data();
                const allowed = data.creatorId === user?.uid || (data.groupId ? await isGroupAdmin(data.groupId, user?.uid || '') : false);
                if (!allowed) {
                    alert('Yetkisiz', 'Bu maçı düzenleme yetkin yok.', [], { type: 'error' });
                    router.back();
                    return;
                }
                const c = data.customizations || {};
                setTeamAName(c.teamAName || '');
                setTeamBName(c.teamBName || '');
                setYesText(c.yesText || c.joinButtonText || '');
                setMaybeText(c.maybeText || '');
                setNoText(c.noText || '');
            } catch (error) {
                console.error(error);
                alert('Hata', 'Maç bilgileri alınamadı.', [], { type: 'error' });
            } finally {
                setLoading(false);
            }
        })();
    }, [id]);

    const handleSave = async () => {
        if (!hasAccess) {
            router.push('/settings/premium');
            return;
        }
        setSaving(true);
        try {
            const yes = yesText.trim() || DEFAULTS.yesText;
            await updateDoc(doc(db, 'matches', id), {
                customizations: {
                    teamAName: teamAName.trim() || DEFAULTS.teamAName,
                    teamBName: teamBName.trim() || DEFAULTS.teamBName,
                    joinButtonText: yes, // legacy readers
                    yesText: yes,
                    maybeText: maybeText.trim() || DEFAULTS.maybeText,
                    noText: noText.trim() || DEFAULTS.noText,
                },
            });
            alert('Kaydedildi', 'Özelleştirmeler kaydedildi!', [], { type: 'success' });
            router.back();
        } catch (error) {
            console.error(error);
            alert('Hata', 'Kaydetme sırasında bir sorun oluştu.', [], { type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <SettingsScreen title="Maçı Özelleştir">
                <View style={st.center}><ActivityIndicator size="large" color={C.primaryText} /></View>
            </SettingsScreen>
        );
    }

    const field = (label: string, value: string, onChange: (v: string) => void, placeholder: string) => (
        <TextField
            label={label}
            value={value}
            onChangeText={onChange}
            placeholder={placeholder}
            editable={hasAccess}
            maxLength={24}
            autoCorrect={false}
            style={{ marginBottom: 12 }}
        />
    );

    return (
        <SettingsScreen title="Maçı Özelleştir">
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    {!hasAccess && (
                        <TouchableOpacity
                            onPress={() => router.push('/settings/premium')}
                            activeOpacity={0.8}
                            style={[st.banner, { backgroundColor: withOpacity(C.gold, 0.12), borderColor: withOpacity(C.gold, 0.35) }]}
                        >
                            <Ionicons name="ribbon-outline" size={22} color={C.gold} />
                            <View style={{ flex: 1 }}>
                                <Text style={[st.bannerTitle, { color: C.text }]}>Kaptan Pro Özelliği</Text>
                                <Text style={[st.bannerText, { color: C.textSecondary }]}>{"Özelleştirme için Kaptan Pro'ya geç veya Jeton kullan."}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
                        </TouchableOpacity>
                    )}

                    <Eyebrow style={st.section}>Takım İsimleri</Eyebrow>
                    {field('Takım A', teamAName, setTeamAName, 'Örn: Kırmızılar')}
                    {field('Takım B', teamBName, setTeamBName, 'Örn: Maviler')}

                    <Eyebrow style={st.section}>Katılım Butonları</Eyebrow>
                    {field('Katıl Butonu', yesText, setYesText, DEFAULTS.yesText)}
                    {field('Yedek Butonu', maybeText, setMaybeText, DEFAULTS.maybeText)}
                    {field('Çık Butonu', noText, setNoText, DEFAULTS.noText)}

                    <Eyebrow style={st.section}>Önizleme</Eyebrow>
                    <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                        <View style={st.previewScore}>
                            <Text style={[st.previewTeam, { color: C.teamA }]} numberOfLines={1}>{teamAName || DEFAULTS.teamAName}</Text>
                            <Text style={[st.previewVs, { color: C.textTertiary }]}>2 – 1</Text>
                            <Text style={[st.previewTeam, { color: C.teamB, textAlign: 'right' }]} numberOfLines={1}>{teamBName || DEFAULTS.teamBName}</Text>
                        </View>
                        <View style={st.previewButtons}>
                            <View style={[st.previewBtn, { backgroundColor: C.primary, borderColor: C.primary }]}>
                                <Text style={[st.previewBtnText, { color: C.onPrimary }]} numberOfLines={1}>{yesText || DEFAULTS.yesText}</Text>
                            </View>
                            <View style={[st.previewBtn, { backgroundColor: C.card, borderColor: C.border }]}>
                                <Text style={[st.previewBtnText, { color: C.text }]} numberOfLines={1}>{maybeText || DEFAULTS.maybeText}</Text>
                            </View>
                            <View style={[st.previewBtn, { backgroundColor: C.card, borderColor: C.border }]}>
                                <Text style={[st.previewBtnText, { color: C.error }]} numberOfLines={1}>{noText || DEFAULTS.noText}</Text>
                            </View>
                        </View>
                    </View>
                </ScrollView>

                <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: insets.bottom + 12 }}>
                    <PrimaryButton
                        label={hasAccess ? 'Kaydet' : "Kaptan Pro'ya Geç"}
                        onPress={handleSave}
                        disabled={saving}
                        loading={saving ? <ActivityIndicator color={C.onPrimary} /> : undefined}
                    />
                </View>
            </KeyboardAvoidingView>
        </SettingsScreen>
    );
}

const st = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    section: { marginTop: 14, marginBottom: 10 },
    banner: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1, marginBottom: 4 },
    bannerTitle: { fontSize: 14, fontWeight: '800' },
    bannerText: { fontSize: 12, marginTop: 2 },
    card: { borderRadius: 20, borderWidth: 1, padding: 16 },
    previewScore: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 14 },
    previewTeam: { flex: 1, fontSize: 14, fontWeight: '800' },
    previewVs: { fontSize: 18, fontWeight: '800' },
    previewButtons: { flexDirection: 'row', gap: 8 },
    previewBtn: { flex: 1, height: 42, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
    previewBtnText: { fontSize: 12.5, fontWeight: '800' },
});
