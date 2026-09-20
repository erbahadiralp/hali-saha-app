import BottomSheet from '@gorhom/bottom-sheet';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { forwardRef, ReactNode, useEffect, useRef, useState } from 'react';
import { Image } from 'expo-image';
import {
    ActivityIndicator,
    Clipboard,
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '../components/CustomAlertProvider';
import { ActionMenuItem, CustomBottomSheet } from '../components/CustomBottomSheet';
import { AnchoredMenu, MenuOption, SettingsScreen, useAnchoredMenu, useSettingsColors } from '../components/settings/SettingsUI';
import { StatsShareCard, THEMES } from '../components/StatsShareCard';
import { withOpacity } from '../constants/designTokens';
import { useAuth } from '../context/AuthContext';
import { usePremium } from '../context/PremiumContext';
import { CardFrameId } from '../services/badgeService';
import { canChangeUsername, getUserProfile, updateUserProfile } from '../services/firestore';
import { claimUsername, USERNAME_TAKEN_MESSAGE } from '../services/onboardingService';
import { uploadImage } from '../services/storageService';

type Position = 'GK' | 'DEF' | 'MID' | 'FWD';
type Foot = 'left' | 'right' | 'both';

const NICKNAMES: Record<Position, string[]> = {
    GK: ['Panter', 'Kova', 'Ahtapot', 'Duvar', 'Örümcek', 'Kedi'],
    DEF: ['Kemik', 'Kasap', 'Tank', 'Sigorta', 'Duvar', 'Terminatör'],
    MID: ['Maestro', 'Beyin', 'Motor', 'Dinamo', 'Sihirbaz', 'Mimar'],
    FWD: ['Gol Makinesi', 'Fırtına', 'Bitirici', 'Hayalet', 'Kobra', 'Sniper'],
};

const POSITION_OPTIONS: MenuOption<Position>[] = [
    { value: 'GK', label: 'Kaleci (GK)', icon: 'hand-left-outline' },
    { value: 'DEF', label: 'Defans (DEF)', icon: 'shield-outline' },
    { value: 'MID', label: 'Orta Saha (MID)', icon: 'git-network-outline' },
    { value: 'FWD', label: 'Forvet (FWD)', icon: 'flash-outline' },
];

const FOOT_OPTIONS: MenuOption<Foot>[] = [
    { value: 'right', label: 'Sağ' },
    { value: 'left', label: 'Sol' },
    { value: 'both', label: 'Her İkisi' },
];

const NO_NICKNAME = '__none__';

// Older profiles stored Turkish position names instead of codes.
const LEGACY_POSITIONS: Record<string, Position> = { Kaleci: 'GK', Defans: 'DEF', 'Orta Saha': 'MID', Forvet: 'FWD' };
const normalizePosition = (value?: string): Position =>
    value && ['GK', 'DEF', 'MID', 'FWD'].includes(value) ? (value as Position) : (value && LEGACY_POSITIONS[value]) || 'MID';

export default function EditProfileScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const { tier, canSeeOverall } = usePremium();
    const isPremium = tier !== 'free';
    const { alert } = useAlert();
    const insets = useSafeAreaInsets();
    const C = useSettingsColors();

    const positionMenu = useAnchoredMenu();
    const footMenu = useAnchoredMenu();
    const nicknameMenu = useAnchoredMenu();
    const bottomSheetRef = useRef<BottomSheet>(null);

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [uploading, setUploading] = useState(false);

    // Form State
    const [displayName, setDisplayName] = useState('');
    const [username, setUsername] = useState('');
    const [originalUsername, setOriginalUsername] = useState('');
    const [nickname, setNickname] = useState('');
    const [position, setPosition] = useState<Position>('MID');
    const [preferredFoot, setPreferredFoot] = useState<Foot>('right');
    const [photoURL, setPhotoURL] = useState('');
    const [usernameChangeAllowed, setUsernameChangeAllowed] = useState(true);
    const [daysRemaining, setDaysRemaining] = useState(0);
    const [selectedFrame, setSelectedFrame] = useState<CardFrameId>('classic');
    const [cardTheme, setCardTheme] = useState('varsayilan');
    const [xp, setXp] = useState(0);
    const [stats, setStats] = useState<any>(null);

    const photoActionItems: ActionMenuItem[] = [
        { id: 'gallery', title: 'Galeriden Seç', icon: 'images-outline', onPress: () => pickImage() },
        ...(photoURL ? [{
            id: 'remove',
            title: 'Fotoğrafı Kaldır',
            icon: 'trash-outline',
            destructive: true,
            onPress: () => setPhotoURL('')
        } as ActionMenuItem] : [])
    ];

    useEffect(() => {
        if (user) {
            loadProfile();
        }
    }, [user]);

    const loadProfile = async () => {
        try {
            const data = await getUserProfile(user!.uid) as any;
            if (data) {
                setDisplayName(data.displayName || '');
                setUsername(data.username || '');
                setOriginalUsername(data.username || '');
                setNickname(data.nickname || '');
                setPosition(normalizePosition(data.position));
                setPreferredFoot(data.preferredFoot || 'right');
                setPhotoURL(data.photoURL || '');
                if (data.selectedFrame) setSelectedFrame(data.selectedFrame);
                if (data.cardTheme) setCardTheme(data.cardTheme);
                setXp(data.stats?.xp || 0);
                setStats(data.stats || null);
            }
            // Check if username change is allowed
            const { allowed, daysRemaining: days } = await canChangeUsername(user!.uid);
            setUsernameChangeAllowed(allowed);
            setDaysRemaining(days);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    const pickImage = async () => {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
            alert('İzin Gerekli', 'Fotoğraf yüklemek için galeri iznine ihtiyacımız var.', [], { type: 'warning' });
            return;
        }

        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            aspect: [1, 1],
            quality: 0.5,
        });

        if (!result.canceled) {
            setUploading(true);
            try {
                const url = await uploadImage(result.assets[0].uri, 'profile', user?.uid);
                if (url) {
                    setPhotoURL(url);
                }
            } catch (e) {
                alert("Hata", "Fotoğraf yüklenemedi", [], { type: 'error' });
            } finally {
                setUploading(false);
            }
        }
    };

    const handleSave = async () => {
        if (!user || saving) return;

        const usernameChanged = username.toLowerCase() !== originalUsername.toLowerCase();

        // Validate username if changed
        if (username && !/^[a-z0-9_]{3,20}$/.test(username)) {
            alert('Hata', 'Kullanıcı adı 3-20 karakter olmalı ve sadece küçük harf, rakam, alt çizgi içermelidir.', [], { type: 'error' });
            return;
        }

        // Check if username change is allowed (30 day limit)
        if (usernameChanged && !usernameChangeAllowed) {
            alert('Hata', `Kullanıcı adını değiştirmek için ${daysRemaining} gün beklemeniz gerekiyor.`, [], { type: 'warning' });
            return;
        }

        setSaving(true);
        try {
            // The rename is atomic (reservation + profile in one transaction) so two people can't end up with the same name.
            if (usernameChanged) {
                await claimUsername(user, username);
            }

            const updateData: any = {
                displayName,
                nickname,
                position,
                preferredFoot,
                photoURL
            };

            // Save selected frame and theme for premium users
            if (isPremium) {
                updateData.selectedFrame = selectedFrame;
                updateData.cardTheme = cardTheme;
            }

            await updateUserProfile(user.uid, updateData);

            alert('Başarılı', 'Profil güncellendi', [], { type: 'success' });
            router.back();
        } catch (error: any) {
            alert('Hata', error?.message === USERNAME_TAKEN_MESSAGE ? USERNAME_TAKEN_MESSAGE : 'Profil güncellenemedi', [], { type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const nicknameOptions: MenuOption<string>[] = [
        { value: NO_NICKNAME, label: 'Lakap yok' },
        ...NICKNAMES[position].map(n => ({ value: n, label: n })),
    ];

    const usernameHelper = usernameChangeAllowed
        ? '30 günde bir değiştirilebilir'
        : `30 günde bir değiştirilebilir · son değişiklik: ${30 - daysRemaining} gün önce`;

    const saveButton = (
        <TouchableOpacity onPress={handleSave} disabled={saving || loading || uploading} hitSlop={12}>
            {saving
                ? <ActivityIndicator size="small" color={C.link} />
                : <Text style={[st.saveText, { color: C.link }, (loading || uploading) && { opacity: 0.4 }]}>Kaydet</Text>}
        </TouchableOpacity>
    );

    if (loading) {
        return (
            <SettingsScreen title="Profili Düzenle">
                <View style={st.center}>
                    <ActivityIndicator size="large" color={C.primaryText} />
                </View>
            </SettingsScreen>
        );
    }

    const inputStyle = [st.input, { backgroundColor: C.input, borderColor: C.border, color: C.text }];

    return (
        <SettingsScreen title="Profili Düzenle" headerRight={saveButton}>
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 32 }}
                    keyboardShouldPersistTaps="handled"
                    showsVerticalScrollIndicator={false}
                >
                    {/* Avatar */}
                    <TouchableOpacity
                        disabled={uploading}
                        onPress={() => bottomSheetRef.current?.expand()}
                        activeOpacity={0.8}
                        style={st.avatarWrap}
                        accessibilityLabel="Profil fotoğrafını değiştir"
                    >
                        <View style={[st.avatar, { backgroundColor: C.iconTile, borderColor: C.border }]}>
                            {uploading ? (
                                <ActivityIndicator color={C.primaryText} />
                            ) : photoURL ? (
                                <Image source={{ uri: photoURL }} style={st.avatarImage} />
                            ) : (
                                <Ionicons name="person" size={40} color={C.textTertiary} />
                            )}
                        </View>
                        <View style={[st.avatarBadge, { backgroundColor: C.primary, borderColor: C.background }]}>
                            <Ionicons name="camera-outline" size={15} color={C.onPrimary} />
                        </View>
                    </TouchableOpacity>

                    <Field label="Ad Soyad">
                        <TextInput
                            value={displayName}
                            onChangeText={setDisplayName}
                            style={inputStyle}
                            placeholder="Adın ve soyadın"
                            placeholderTextColor={C.placeholder}
                        />
                    </Field>

                    <Field label="Kullanıcı Adı" helper={usernameHelper}>
                        <TextInput
                            value={username}
                            onChangeText={(text) => setUsername(text.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                            style={[inputStyle, !usernameChangeAllowed && { color: C.textSecondary }]}
                            placeholder="kullanici_adi"
                            placeholderTextColor={C.placeholder}
                            autoCapitalize="none"
                            autoCorrect={false}
                            editable={usernameChangeAllowed}
                        />
                    </Field>

                    <Field label="Lakap">
                        <SelectField
                            ref={nicknameMenu.anchorRef}
                            value={nickname}
                            placeholder="Lakap seç"
                            onPress={nicknameMenu.open}
                        />
                    </Field>

                    <Field label="Mevki">
                        <SelectField
                            ref={positionMenu.anchorRef}
                            value={POSITION_OPTIONS.find(o => o.value === position)?.label ?? ''}
                            onPress={positionMenu.open}
                        />
                    </Field>

                    <Field label="Tercih Edilen Ayak">
                        <SelectField
                            ref={footMenu.anchorRef}
                            value={FOOT_OPTIONS.find(o => o.value === preferredFoot)?.label ?? ''}
                            onPress={footMenu.open}
                        />
                    </Field>

                    {/* Premium card theme */}
                    {isPremium && (
                        <View style={{ marginTop: 6 }}>
                            <Text style={[st.label, { color: C.textSecondary }]}>Kart Teması</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={st.themeRow}>
                                {Object.entries(THEMES).map(([key, theme]: [string, any]) => {
                                    const active = cardTheme === key;
                                    return (
                                        <TouchableOpacity
                                            key={key}
                                            onPress={() => setCardTheme(key)}
                                            activeOpacity={0.8}
                                            style={[st.themeChip, { backgroundColor: C.card, borderColor: active ? C.primary : C.border }, active && { backgroundColor: withOpacity(C.accent, 0.1) }]}
                                        >
                                            <Text style={st.themeEmoji}>{theme.emoji}</Text>
                                            <Text style={[st.themeLabel, { color: active ? C.link : C.textSecondary }]}>{theme.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                            <View style={st.preview}>
                                <StatsShareCard
                                    stats={{
                                        displayName: displayName || 'OYUNCU',
                                        goals: stats?.goals || 0,
                                        assists: stats?.assists || 0,
                                        matchesPlayed: stats?.matchesPlayed || 0,
                                        wins: stats?.wins || 0,
                                        motmCount: stats?.motmCount || 0,
                                        overall: stats?.overall || 0,
                                        position,
                                        photoURL,
                                        nickname,
                                        preferredFoot,
                                        xp: xp,
                                    }}
                                    theme={cardTheme}
                                    hideShareButton={true}
                                    canSeeOverall={canSeeOverall}
                                />
                            </View>
                        </View>
                    )}

                    <View style={[st.idRow, { borderTopColor: C.divider }]}>
                        <Text style={[st.idText, { color: C.textSecondary }]} numberOfLines={1}>
                            Kullanıcı ID: #{(user?.uid || '').slice(0, 8).toUpperCase()}
                        </Text>
                        <TouchableOpacity
                            hitSlop={10}
                            onPress={() => {
                                Clipboard.setString(user?.uid || '');
                                alert('Kopyalandı', 'Kullanıcı ID panoya kopyalandı.', [], { type: 'success' });
                            }}
                        >
                            <Text style={[st.copyText, { color: C.link }]}>Kopyala</Text>
                        </TouchableOpacity>
                    </View>
                </ScrollView>
            </KeyboardAvoidingView>

            <AnchoredMenu
                fullWidth
                anchor={nicknameMenu.anchor}
                options={nicknameOptions}
                selected={nickname || NO_NICKNAME}
                onSelect={(value) => setNickname(value === NO_NICKNAME ? '' : value)}
                onClose={nicknameMenu.close}
            />
            <AnchoredMenu
                fullWidth
                anchor={positionMenu.anchor}
                options={POSITION_OPTIONS}
                selected={position}
                onSelect={(value) => {
                    if (value !== position) setNickname(''); // Nicknames are position-specific
                    setPosition(value);
                }}
                onClose={positionMenu.close}
            />
            <AnchoredMenu
                fullWidth
                anchor={footMenu.anchor}
                options={FOOT_OPTIONS}
                selected={preferredFoot}
                onSelect={setPreferredFoot}
                onClose={footMenu.close}
            />

            {/* Custom Action Menu for Profile Photo */}
            <CustomBottomSheet
                ref={bottomSheetRef}
                title="Profil Fotoğrafı"
                items={photoActionItems}
            />
        </SettingsScreen>
    );
}

function Field({ label, helper, children }: { label: string; helper?: string; children: ReactNode }) {
    const C = useSettingsColors();
    return (
        <View style={st.field}>
            <Text style={[st.label, { color: C.textSecondary }]}>{label}</Text>
            {children}
            {helper ? <Text style={[st.helper, { color: C.textTertiary }]}>{helper}</Text> : null}
        </View>
    );
}

const SelectField = forwardRef<View, { value: string; placeholder?: string; onPress: () => void }>(
    ({ value, placeholder, onPress }, ref) => {
        const C = useSettingsColors();
        return (
            <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
                <View ref={ref} collapsable={false} style={[st.input, st.select, { backgroundColor: C.input, borderColor: C.border }]}>
                    <Text style={[st.selectText, { color: value ? C.text : C.placeholder }]} numberOfLines={1}>
                        {value || placeholder}
                    </Text>
                    <Ionicons name="chevron-down" size={18} color={C.textTertiary} />
                </View>
            </TouchableOpacity>
        );
    }
);
SelectField.displayName = 'SelectField';

const st = StyleSheet.create({
    center: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    saveText: {
        fontSize: 15,
        fontWeight: '800',
    },
    avatarWrap: {
        alignSelf: 'center',
        marginTop: 8,
        marginBottom: 20,
    },
    avatar: {
        width: 88,
        height: 88,
        borderRadius: 24,
        borderWidth: 1,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarImage: {
        width: '100%',
        height: '100%',
    },
    avatarBadge: {
        position: 'absolute',
        right: -4,
        bottom: -4,
        width: 30,
        height: 30,
        borderRadius: 15,
        borderWidth: 3,
        alignItems: 'center',
        justifyContent: 'center',
    },
    field: {
        marginBottom: 14,
    },
    label: {
        fontSize: 12,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 7,
        marginLeft: 2,
    },
    helper: {
        fontSize: 11,
        fontWeight: '600',
        marginTop: 5,
        marginLeft: 2,
    },
    input: {
        height: 50,
        borderRadius: 14,
        borderWidth: 1,
        paddingHorizontal: 16,
        fontSize: 15,
    },
    select: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    selectText: {
        flex: 1,
        fontSize: 15,
    },
    themeRow: {
        gap: 8,
        paddingBottom: 12,
    },
    themeChip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 999,
        borderWidth: 1,
    },
    themeEmoji: {
        fontSize: 14,
    },
    themeLabel: {
        fontSize: 12.5,
        fontWeight: '700',
    },
    preview: {
        transform: [{ scale: 0.9 }],
        marginVertical: -10,
    },
    idRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 12,
        paddingVertical: 14,
        marginTop: 6,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    idText: {
        flex: 1,
        fontSize: 13,
        fontWeight: '600',
    },
    copyText: {
        fontSize: 12.5,
        fontWeight: '700',
    },
});
