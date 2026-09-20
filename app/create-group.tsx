import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Image } from 'expo-image';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '../components/CustomAlertProvider';
import { Eyebrow, PrimaryButton, Sheet, SheetRow } from '../components/group/GroupUI';
import { SettingsScreen, useSettingsColors } from '../components/settings/SettingsUI';
import { useAuth } from '../context/AuthContext';
import { usePremium } from '../context/PremiumContext';
import { createGroup } from '../services/firestore';
import { uploadImage } from '../services/storageService';

/** Layout: design/tasarım/macvar-screens-4.html (Yeni Grup); colors from designTokens. */

type Privacy = 'public' | 'private';

const PRIVACY_OPTIONS: { value: Privacy; title: string; description: string }[] = [
    { value: 'public', title: 'Herkese Açık', description: 'Herkes grubu görebilir ve direkt katılabilir' },
    { value: 'private', title: 'Onaylı Katılım', description: 'Katılmak için yönetici onayı gerekir' },
];

export default function CreateGroupScreen() {
    const router = useRouter();
    const { alert } = useAlert();
    const { user } = useAuth();
    const { canCreateGroup, groupMemberships, incrementGroupCount, tier } = usePremium();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    const [name, setName] = useState('');
    const [privacy, setPrivacy] = useState<Privacy>('public');
    const [photoURL, setPhotoURL] = useState('');
    const [uploading, setUploading] = useState(false);
    const [loading, setLoading] = useState(false);
    const [showPhotoSheet, setShowPhotoSheet] = useState(false);

    const showLimitAlert = () => {
        alert(
            'Grup Limiti Doldu',
            tier === 'free'
                ? 'Ücretsiz hesapta sadece 1 gruba üye olabilirsin. Oyuncu Pro ile 3, Kaptan Pro ile sınırsız grup!'
                : "Oyuncu Pro ile 3 gruba üye olabilirsin. Sınırsız grup için Kaptan Pro'ya yükselt.",
            [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'Yükselt', onPress: () => router.push('/settings/premium') },
            ],
            { type: 'warning' }
        );
    };

    const pickImage = async () => {
        setShowPhotoSheet(false);
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            alert('İzin Gerekli', 'Fotoğraf yüklemek için galeri iznine ihtiyacımız var.', [], { type: 'warning' });
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.5 });
        if (result.canceled) return;
        setUploading(true);
        try {
            const url = await uploadImage(result.assets[0].uri, 'group');
            if (url) setPhotoURL(url);
        } catch {
            alert('Hata', 'Fotoğraf yüklenemedi', [], { type: 'error' });
        } finally {
            setUploading(false);
        }
    };

    const handleCreate = async () => {
        if (!user) return;
        if (!name.trim()) {
            alert('Hata', 'Grup adı boş olamaz.', [], { type: 'error' });
            return;
        }
        if (!canCreateGroup) {
            showLimitAlert();
            return;
        }
        setLoading(true);
        try {
            await createGroup(name.trim(), '', '', photoURL, user.uid, privacy);
            await incrementGroupCount();
            alert('Başarılı', 'Grup oluşturuldu!', [], { type: 'success' });
            router.back();
        } catch (error) {
            console.error(error);
            alert('Hata', 'Grup oluşturulurken bir sorun oluştu.', [], { type: 'error' });
        } finally {
            setLoading(false);
        }
    };

    const limitText = tier === 'captain'
        ? null
        : tier === 'player'
            ? `Oyuncu Pro planında 3 grup limitin var (${groupMemberships}/3). Sınırsız grup için Kaptan Pro'ya geç.`
            : `Ücretsiz planda 1 grup limitine sahipsin (${groupMemberships}/1). Sınırsız grup için Kaptan Pro'ya geç.`;

    return (
        <SettingsScreen title="Yeni Grup">
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <ScrollView contentContainerStyle={st.content} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <TouchableOpacity
                        activeOpacity={0.8}
                        disabled={uploading}
                        onPress={() => (photoURL ? setShowPhotoSheet(true) : pickImage())}
                        style={[st.photo, { backgroundColor: C.card, borderColor: photoURL ? C.border : C.textTertiary }, !photoURL && st.photoDashed]}
                    >
                        {uploading ? (
                            <ActivityIndicator color={C.primaryText} />
                        ) : photoURL ? (
                            <>
                                <Image source={{ uri: photoURL }} style={st.photoImage} />
                                <View style={st.photoInfo}>
                                    <Text style={[st.photoTitle, { color: C.text }]}>Grup fotoğrafı</Text>
                                    <Text style={[st.photoSub, { color: C.link }]}>Değiştirmek için dokun</Text>
                                </View>
                            </>
                        ) : (
                            <>
                                <Ionicons name="camera-outline" size={26} color={C.textSecondary} />
                                <Text style={[st.photoLabel, { color: C.textSecondary }]}>Grup Fotoğrafı Yükle</Text>
                            </>
                        )}
                    </TouchableOpacity>

                    <Text style={[st.fieldLabel, { color: C.textSecondary }]}>Grup Adı</Text>
                    <TextInput
                        value={name}
                        onChangeText={setName}
                        placeholder="Örn: Perşembe Ekibi"
                        placeholderTextColor={C.placeholder}
                        maxLength={40}
                        style={[st.input, { backgroundColor: C.input, borderColor: C.border, color: C.text }]}
                    />

                    <Eyebrow style={{ marginTop: 20, marginBottom: 10 }}>Gizlilik Ayarı</Eyebrow>
                    <View style={{ gap: 10 }}>
                        {PRIVACY_OPTIONS.map(opt => {
                            const selected = privacy === opt.value;
                            return (
                                <TouchableOpacity
                                    key={opt.value}
                                    activeOpacity={0.8}
                                    onPress={() => setPrivacy(opt.value)}
                                    style={[st.option, { backgroundColor: C.card, borderColor: selected ? C.link : C.border }]}
                                >
                                    <View style={[st.radio, { borderColor: selected ? C.link : C.textTertiary }]}>
                                        {selected && <View style={[st.radioDot, { backgroundColor: C.link }]} />}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={[st.optionTitle, { color: C.text }]}>{opt.title}</Text>
                                        <Text style={[st.optionSub, { color: C.textSecondary }]}>{opt.description}</Text>
                                    </View>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    {limitText && (
                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => router.push('/settings/premium')}
                            style={[st.info, { backgroundColor: C.card, borderColor: C.border }]}
                        >
                            <Text style={[st.infoText, { color: C.textSecondary }]}>{limitText}</Text>
                        </TouchableOpacity>
                    )}
                </ScrollView>

                <View style={[st.footer, { paddingBottom: insets.bottom + 12 }]}>
                    <PrimaryButton
                        label="Grubu Oluştur"
                        onPress={handleCreate}
                        disabled={!name.trim() || loading || uploading}
                        loading={loading ? <ActivityIndicator color={C.onPrimary} /> : undefined}
                    />
                </View>
            </KeyboardAvoidingView>

            <Sheet visible={showPhotoSheet} onClose={() => setShowPhotoSheet(false)} title="Grup Fotoğrafı">
                <SheetRow icon="images-outline" label="Galeriden Seç" onPress={pickImage} />
                <SheetRow icon="trash-outline" label="Fotoğrafı Kaldır" danger last onPress={() => { setPhotoURL(''); setShowPhotoSheet(false); }} />
            </Sheet>
        </SettingsScreen>
    );
}

const st = StyleSheet.create({
    content: { paddingHorizontal: 16, paddingTop: 4, paddingBottom: 24 },

    photo: { height: 120, borderRadius: 18, borderWidth: 1, alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 20, overflow: 'hidden' },
    photoDashed: { borderWidth: 2, borderStyle: 'dashed' },
    photoLabel: { fontSize: 12.5, fontWeight: '700' },
    photoImage: { position: 'absolute', left: 16, width: 88, height: 88, borderRadius: 16 },
    photoInfo: { position: 'absolute', left: 120, right: 16 },
    photoTitle: { fontSize: 14, fontWeight: '700' },
    photoSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },

    fieldLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7 },
    input: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15 },

    option: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, borderRadius: 16, borderWidth: 1.5 },
    radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
    radioDot: { width: 10, height: 10, borderRadius: 5 },
    optionTitle: { fontSize: 14, fontWeight: '700' },
    optionSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },

    info: { marginTop: 20, borderRadius: 20, borderWidth: 1, padding: 18 },
    infoText: { fontSize: 12, fontWeight: '600', lineHeight: 18 },

    footer: { paddingHorizontal: 16, paddingTop: 12 },
});
