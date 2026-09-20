import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { signOut } from 'firebase/auth';
import { useEffect, useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInRight } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withOpacity } from '../constants/designTokens';
import { useAuth } from '../context/AuthContext';
import { auth } from '../firebaseConfig';
import { completeOnboarding, isUsernameFree, Position, PreferredFoot, USERNAME_PATTERN } from '../services/onboardingService';
import { uploadImage } from '../services/storageService';
import { useAlert } from './CustomAlertProvider';
import { Avatar, Eyebrow, PrimaryButton } from './group/GroupUI';
import { useSettingsColors } from './settings/SettingsUI';

/**
 * Onboarding (design/tasarım/macvar-screens-4.html › Onboarding); colors from designTokens.
 * Steps: 1) kullanıcı adı (zorunlu) 2) mevki + tercih edilen ayak 3) profil fotoğrafı (opsiyonel).
 * Shown to every new account regardless of sign-up method.
 */

const POSITIONS: { id: Position; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
    { id: 'FWD', label: 'Forvet', icon: 'football-outline' },
    { id: 'MID', label: 'Orta Saha', icon: 'swap-horizontal-outline' },
    { id: 'DEF', label: 'Defans', icon: 'shield-outline' },
    { id: 'GK', label: 'Kaleci', icon: 'hand-left-outline' },
];
const LEGACY_POSITIONS: Record<string, Position> = { Forvet: 'FWD', 'Orta Saha': 'MID', Defans: 'DEF', Kaleci: 'GK' };

const FEET: { id: PreferredFoot; label: string }[] = [
    { id: 'right', label: 'Sağ' },
    { id: 'left', label: 'Sol' },
    { id: 'both', label: 'Her İkisi' },
];

const STEPS = 3;
type UsernameState = 'idle' | 'invalid' | 'checking' | 'free' | 'taken';

interface OnboardingScreenProps {
    /** Existing profile values (e.g. Google photo) used to prefill the steps. */
    initialProfile?: any;
    onComplete: () => void;
}

export default function OnboardingScreen({ initialProfile, onComplete }: OnboardingScreenProps) {
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();
    const { alert } = useAlert();
    const { user } = useAuth();

    const [step, setStep] = useState(0);
    const [username, setUsername] = useState(initialProfile?.needsUsername ? '' : initialProfile?.username ?? '');
    const [availability, setAvailability] = useState<{ name: string; free: boolean } | null>(null);
    const [position, setPosition] = useState<Position | null>(
        POSITIONS.some(p => p.id === initialProfile?.position) ? initialProfile.position : LEGACY_POSITIONS[initialProfile?.position] ?? null
    );
    const [foot, setFoot] = useState<PreferredFoot | null>(initialProfile?.preferredFoot ?? null);
    const [photoURL, setPhotoURL] = useState<string | null>(initialProfile?.photoURL ?? user?.photoURL ?? null);
    const [uploading, setUploading] = useState(false);
    const [saving, setSaving] = useState(false);

    // Format is checked synchronously; availability is looked up (debounced) only for well-formed names.
    const formatValid = USERNAME_PATTERN.test(username);
    const usernameState: UsernameState = username.length === 0
        ? 'idle'
        : !formatValid
            ? 'invalid'
            : availability && availability.name === username
                ? (availability.free ? 'free' : 'taken')
                : 'checking';

    useEffect(() => {
        if (!user || !formatValid) return;
        let cancelled = false;
        const timer = setTimeout(async () => {
            try {
                const free = await isUsernameFree(username, user.uid);
                if (!cancelled) setAvailability({ name: username, free });
            } catch {
                // Leave it "checking"; saving re-validates on the server side anyway.
            }
        }, 450);
        return () => { cancelled = true; clearTimeout(timer); };
    }, [username, formatValid, user]);

    const finish = async (withPhoto: boolean) => {
        if (!user) return;
        setSaving(true);
        try {
            await completeOnboarding(user, { username, position, preferredFoot: foot, photoURL: withPhoto ? photoURL : null });
            onComplete();
        } catch (error: any) {
            alert('Kaydedilemedi', error?.message || 'Bilgilerin kaydedilemedi, tekrar dene.', [], { type: 'error' });
            if (/kullanıcı adı/i.test(error?.message || '')) setStep(0);
        } finally {
            setSaving(false);
        }
    };

    const pickPhoto = async () => {
        if (!user) return;
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            alert('İzin Gerekli', 'Fotoğraf seçmek için galeri iznine ihtiyacımız var.', [], { type: 'warning' });
            return;
        }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 0.7 });
        if (result.canceled || !result.assets[0]) return;
        setUploading(true);
        try {
            const url = await uploadImage(result.assets[0].uri, 'profile', user.uid);
            if (url) setPhotoURL(url);
        } finally {
            setUploading(false);
        }
    };

    const next = () => {
        if (step < STEPS - 1) setStep(step + 1);
        else finish(true);
    };
    const skip = () => {
        if (step < STEPS - 1) setStep(step + 1);
        else finish(false);
    };

    const canContinue = step === 0 ? usernameState === 'free' : step === 1 ? !!position && !!foot : !uploading;

    /* ─────────────────────────── Steps ─────────────────────────── */

    const header = (title: string, subtitle: string) => (
        <>
            <Text style={[st.title, { color: C.text }]}>{title}</Text>
            <Text style={[st.subtitle, { color: C.textSecondary }]}>{subtitle}</Text>
        </>
    );

    const usernameHint = {
        idle: { text: '3-20 karakter; harf, rakam ve alt çizgi (_)', color: C.textTertiary },
        invalid: { text: 'Sadece küçük harf, rakam ve _ kullan (3-20 karakter)', color: C.error },
        checking: { text: 'Kontrol ediliyor…', color: C.textSecondary },
        free: { text: 'Bu kullanıcı adı müsait', color: C.link },
        taken: { text: 'Bu kullanıcı adı alınmış', color: C.error },
    }[usernameState];

    const renderUsername = () => (
        <>
            {header('Kullanıcı Adını Seç', 'Diğer oyuncular seni bu isimle bulacak ve davet edecek.')}
            <View style={[
                st.usernameField,
                { backgroundColor: C.input, borderColor: usernameState === 'free' ? C.link : usernameState === 'taken' || usernameState === 'invalid' ? C.error : C.border },
            ]}>
                <Text style={[st.at, { color: C.link }]}>@</Text>
                <TextInput
                    value={username}
                    onChangeText={t => setUsername(t.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="kullanici_adi"
                    placeholderTextColor={C.placeholder}
                    autoCapitalize="none"
                    autoCorrect={false}
                    autoFocus
                    maxLength={20}
                    returnKeyType="next"
                    onSubmitEditing={() => canContinue && next()}
                    style={[st.usernameInput, { color: C.text }]}
                />
                {usernameState === 'checking' && <ActivityIndicator size="small" color={C.textSecondary} />}
                {usernameState === 'free' && <Ionicons name="checkmark-circle" size={22} color={C.link} />}
                {(usernameState === 'taken' || usernameState === 'invalid') && <Ionicons name="close-circle" size={22} color={C.error} />}
            </View>
            <Text style={[st.hint, { color: usernameHint.color }]}>{usernameHint.text}</Text>
        </>
    );

    const renderPosition = () => (
        <>
            {header('Mevkini Seç', 'Sahada en çok nerede oynarsın?')}
            <View style={st.grid}>
                {POSITIONS.map(p => {
                    const on = position === p.id;
                    return (
                        <TouchableOpacity
                            key={p.id}
                            onPress={() => setPosition(p.id)}
                            activeOpacity={0.8}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: on }}
                            style={[st.choice, { backgroundColor: on ? withOpacity(C.accent, 0.1) : C.card, borderColor: on ? C.link : C.border }]}
                        >
                            <View style={[st.choiceIcon, { backgroundColor: C.iconTile }]}>
                                <Ionicons name={p.icon} size={22} color={on ? C.link : C.text} />
                            </View>
                            <Text style={[st.choiceLabel, { color: C.text }]}>{p.label}</Text>
                            <Text style={[st.choiceCode, { color: C.textTertiary }]}>{p.id}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            <Eyebrow style={{ marginTop: 24, marginBottom: 10 }}>Tercih Edilen Ayak</Eyebrow>
            <View style={st.feet}>
                {FEET.map(f => {
                    const on = foot === f.id;
                    return (
                        <TouchableOpacity
                            key={f.id}
                            onPress={() => setFoot(f.id)}
                            activeOpacity={0.8}
                            accessibilityRole="radio"
                            accessibilityState={{ selected: on }}
                            style={[st.foot, { backgroundColor: on ? withOpacity(C.accent, 0.1) : C.card, borderColor: on ? C.link : C.border }]}
                        >
                            <Text style={[st.footText, { color: on ? C.link : C.text }]}>{f.label}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </>
    );

    const renderPhoto = () => (
        <>
            {header('Profil Fotoğrafı', 'Kadrolarda ve maç kartlarında arkadaşların seni tanısın.')}
            <TouchableOpacity onPress={pickPhoto} disabled={uploading} activeOpacity={0.85} style={st.photoWrap} accessibilityLabel="Fotoğraf seç">
                <View style={[st.photoRing, { borderColor: C.border }]}>
                    {uploading
                        ? <View style={[st.photoPlaceholder, { backgroundColor: C.avatar }]}><ActivityIndicator color={C.primaryText} /></View>
                        : <Avatar uri={photoURL ?? undefined} name={initialProfile?.displayName || user?.displayName || username} size={112} radius={32} />}
                </View>
                <View style={[st.photoBadge, { backgroundColor: C.primary, borderColor: C.gradient[0] }]}>
                    <Ionicons name="camera" size={16} color={C.onPrimary} />
                </View>
            </TouchableOpacity>
            <Text style={[st.photoName, { color: C.text }]}>@{username}</Text>
            <TouchableOpacity onPress={pickPhoto} disabled={uploading} hitSlop={10}>
                <Text style={[st.photoLink, { color: C.link }]}>{photoURL ? 'Fotoğrafı Değiştir' : 'Galeriden Fotoğraf Seç'}</Text>
            </TouchableOpacity>
        </>
    );

    /* ─────────────────────────── Render ─────────────────────────── */

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <LinearGradient colors={[C.gradient[0], C.gradient[1]]} style={StyleSheet.absoluteFill} />
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
                <View style={[st.top, { paddingTop: insets.top + 12 }]}>
                    {step > 0 ? (
                        <TouchableOpacity onPress={() => setStep(step - 1)} hitSlop={12} accessibilityLabel="Geri">
                            <Ionicons name="chevron-back" size={24} color={C.text} />
                        </TouchableOpacity>
                    ) : <View style={st.topSide} />}
                    <View style={st.dots}>
                        {Array.from({ length: STEPS }).map((_, i) => (
                            <View key={i} style={[st.dot, { backgroundColor: i <= step ? C.link : C.divider }]} />
                        ))}
                    </View>
                    {step === 0 ? (
                        <TouchableOpacity onPress={() => signOut(auth)} hitSlop={12} accessibilityLabel="Çıkış yap">
                            <Text style={[st.signOut, { color: C.textTertiary }]}>Çıkış</Text>
                        </TouchableOpacity>
                    ) : <View style={st.topSide} />}
                </View>

                <ScrollView contentContainerStyle={st.body} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                    <Animated.View key={step} entering={FadeInRight.duration(220)}>
                        {step === 0 && renderUsername()}
                        {step === 1 && renderPosition()}
                        {step === 2 && renderPhoto()}
                    </Animated.View>
                </ScrollView>

                <View style={[st.footer, { paddingBottom: insets.bottom + 16 }]}>
                    <PrimaryButton
                        label={step === STEPS - 1 ? 'Başla' : 'Devam Et'}
                        onPress={next}
                        disabled={!canContinue || saving}
                        loading={saving ? <ActivityIndicator color={C.onPrimary} /> : undefined}
                    />
                    {step > 0 && (
                        <TouchableOpacity onPress={skip} disabled={saving || uploading} hitSlop={10} style={st.skip}>
                            <Text style={[st.skipText, { color: C.textTertiary }]}>Şimdilik Geç</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </KeyboardAvoidingView>
        </View>
    );
}

const st = StyleSheet.create({
    top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 8 },
    topSide: { width: 40 },
    dots: { flexDirection: 'row', gap: 6 },
    dot: { width: 26, height: 5, borderRadius: 3 },
    signOut: { width: 40, textAlign: 'right', fontSize: 13, fontWeight: '700' },

    body: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 },
    title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.6, textAlign: 'center', marginBottom: 6 },
    subtitle: { fontSize: 13.5, fontWeight: '600', textAlign: 'center', marginBottom: 24, lineHeight: 19 },

    usernameField: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 56, borderRadius: 16, borderWidth: 1.5, paddingHorizontal: 16 },
    at: { fontSize: 20, fontWeight: '800' },
    usernameInput: { flex: 1, fontSize: 17, fontWeight: '700' },
    hint: { fontSize: 12.5, fontWeight: '600', marginTop: 8, marginLeft: 4 },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    choice: { width: '47%', flexGrow: 1, borderRadius: 18, borderWidth: 1.5, paddingVertical: 20, paddingHorizontal: 12, alignItems: 'center' },
    choiceIcon: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
    choiceLabel: { fontSize: 14, fontWeight: '800' },
    choiceCode: { fontSize: 10.5, fontWeight: '600', marginTop: 3 },

    feet: { flexDirection: 'row', gap: 10 },
    foot: { flex: 1, borderRadius: 14, borderWidth: 1.5, paddingVertical: 14, alignItems: 'center' },
    footText: { fontSize: 13.5, fontWeight: '700' },

    photoWrap: { alignSelf: 'center', marginTop: 8 },
    photoRing: { borderWidth: 2, borderRadius: 36, padding: 4 },
    photoPlaceholder: { width: 112, height: 112, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
    photoBadge: { position: 'absolute', right: -4, bottom: -4, width: 36, height: 36, borderRadius: 18, borderWidth: 3, alignItems: 'center', justifyContent: 'center' },
    photoName: { fontSize: 17, fontWeight: '800', textAlign: 'center', marginTop: 16 },
    photoLink: { fontSize: 14, fontWeight: '700', textAlign: 'center', marginTop: 10 },

    footer: { paddingHorizontal: 20, paddingTop: 8 },
    skip: { alignSelf: 'center', paddingVertical: 12 },
    skipText: { fontSize: 12.5, fontWeight: '700' },
});
