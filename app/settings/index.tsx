import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { EmailAuthProvider, reauthenticateWithCredential, signInWithEmailAndPassword, signOut, updatePassword } from 'firebase/auth';
import { doc, serverTimestamp, setDoc } from 'firebase/firestore';
import { useState } from 'react';
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Linking,
    Modal,
    Platform,
    ScrollView,
    Share,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '../../components/CustomAlertProvider';
import {
    AnchoredMenu,
    MenuOption,
    SectionLabel,
    SettingsRow,
    SettingsScreen as SettingsLayout,
    useAnchoredMenu,
    useSettingsColors,
} from '../../components/settings/SettingsUI';
import { palette, withOpacity } from '../../constants/designTokens';
import { useAuth } from '../../context/AuthContext';
import { usePremium } from '../../context/PremiumContext';
import { useTheme } from '../../context/ThemeContext';
import { auth, db } from '../../firebaseConfig';
import { addAllUsersToGroup } from '../../services/adminScripts';
import { SPECIAL_USERS, createSpecialUsers, testAccountEmail } from '../../services/adminUsers';
import { ACCOUNT_GRACE_DAYS, DELETE_CONFIRM_WORD, accountUsesPassword, deleteUserAccount } from '../../services/deleteUserAccount';
import {
    DEV_CREDENTIALS_MISSING_MESSAGE,
    DEV_OWNER_PASSWORD,
    DEV_OWNER_USERNAME,
    DEV_TEST_PASSWORD,
    hasDevOwnerCredentials,
    hasDevTestPassword,
} from '../../utils/devCredentials';
import {
    createUpcomingMatchScenario,
    createFinishedMatchScenario,
    simulateMvpVotingScenario,
    simulateDisputeFlowScenario,
    resetTestDataScenario
} from '../../services/testService';

type ThemeMode = 'light' | 'dark' | 'system';
type LegalRoute = '/privacy-policy' | '/terms-of-service' | '/kvkk-aydinlatma';

const THEME_OPTIONS: MenuOption<ThemeMode>[] = [
    { label: 'Açık', value: 'light', icon: 'sunny-outline' },
    { label: 'Koyu', value: 'dark', icon: 'moon-outline' },
    { label: 'Sistem', value: 'system', icon: 'phone-portrait-outline' },
];

const LEGAL_OPTIONS: MenuOption<LegalRoute>[] = [
    { label: 'Gizlilik Politikası', value: '/privacy-policy', icon: 'shield-checkmark-outline' },
    { label: 'Kullanım Koşulları', value: '/terms-of-service', icon: 'document-text-outline' },
    { label: 'KVKK Aydınlatma', value: '/kvkk-aydinlatma', icon: 'information-circle-outline' },
];

const TIER_LABELS: Record<string, string> = { free: 'Ücretsiz', player: 'Oyuncu Pro', captain: 'Kaptan Pro' };

export default function SettingsScreen() {
    const { user } = useAuth();
    const router = useRouter();
    const { themeMode, setThemeMode } = useTheme();
    const { tier, isPremium } = usePremium();
    const { alert } = useAlert();
    const insets = useSafeAreaInsets();
    const C = useSettingsColors();
    const themeMenu = useAnchoredMenu();
    const legalMenu = useAnchoredMenu();

    const [showPasswordModal, setShowPasswordModal] = useState(false);
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [passwordLoading, setPasswordLoading] = useState(false);

    // Delete Account State
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [deletePassword, setDeletePassword] = useState('');
    const [deleteReason, setDeleteReason] = useState('');
    const [deleteLoading, setDeleteLoading] = useState(false);
    // Google/Apple accounts have no password to re-enter, so they type a confirmation word instead.
    const deleteWithPassword = accountUsesPassword(user);

    // Developer Mode State
    const [devTapCount, setDevTapCount] = useState(0);
    const [showDevOptions, setShowDevOptions] = useState(false);
    const [devLoading, setDevLoading] = useState<string | null>(null);

    const handleDevTap = () => {
        if (!__DEV__) return;
        const newCount = devTapCount + 1;
        setDevTapCount(newCount);
        if (newCount === 5) {
            setShowDevOptions(!showDevOptions);
            alert(
                !showDevOptions ? '👨‍💻 Geliştirici Modu Açık' : 'Admin paneli gizlendi',
                !showDevOptions ? 'Test hesapları bölümü aktif edildi.' : '',
                [],
                { type: 'info' }
            );
            setDevTapCount(0);
        }
    };

    const handleBatchCreate = async () => {
        if (devLoading) return;
        if (!hasDevTestPassword()) {
            alert('Hata', DEV_CREDENTIALS_MISSING_MESSAGE, [], { type: 'error' });
            return;
        }
        setDevLoading('batch');

        try {
            // Dynamically import to avoid top-level side effects
            const { initializeApp, getApp, getApps } = await import('firebase/app');
            const { initializeAuth, getAuth, inMemoryPersistence, createUserWithEmailAndPassword: createAuthUser, updateProfile: updateAuthProfile, signOut: signOutAuth } = await import('firebase/auth');

            // Use a unique name for the secondary app
            const SECONDARY_APP_NAME = 'SecondaryAppForUserCreation';
            let secondaryApp;
            let secondaryAuth;

            const existingApp = getApps().find(app => app.name === SECONDARY_APP_NAME);

            if (existingApp) {
                secondaryApp = existingApp;
                secondaryAuth = getAuth(secondaryApp);
            } else {
                // Initialize new secondary app
                const defaultApp = getApp();
                secondaryApp = initializeApp(defaultApp.options, SECONDARY_APP_NAME);
                // Initialize auth with memory persistence to avoid AsyncStorage warning
                secondaryAuth = initializeAuth(secondaryApp, {
                    persistence: inMemoryPersistence
                });
            }

            let createdCount = 0;

            for (let i = 1; i <= 20; i++) {
                const target = {
                    email: `player${i}@halisaha.com`,
                    password: DEV_TEST_PASSWORD,
                    name: `Test Player ${i}`,
                    username: `test_player_${i}`,
                    rating: 5.0 + (i * 0.1)
                };

                try {
                    // Try creating
                    const cred = await createAuthUser(secondaryAuth, target.email, target.password);

                    // Update profile
                    await updateAuthProfile(cred.user, {
                        displayName: target.name,
                        photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(target.name)}&background=random`
                    });

                    // Create Firestore doc (using main app's db is fine)
                    await setDoc(doc(db, "users", cred.user.uid), {
                        name: target.name,
                        username: target.username,
                        email: target.email,
                        bio: `Test user (Player ${i})`,
                        position: 'Forvet',
                        rating: target.rating,
                        matchesPlayed: 0,
                        createdAt: serverTimestamp(),
                        preferences: {
                            notifications: true,
                            theme: 'system'
                        }
                    });

                    createdCount++;
                    // Optional: signOut after each to be safe, though not strictly necessary if we just reuse auth instance
                    await signOutAuth(secondaryAuth);

                } catch (e: any) {
                    if (e.code === 'auth/email-already-in-use') {
                        // Ignore
                    } else {
                        console.error(`Failed to create player ${i}:`, e);
                    }
                }
            }

            alert('İşlem Tamamlandı', `${createdCount} yeni test hesabı oluşturuldu. (Zaten var olanlar atlandı)`, [], { type: 'success' });

        } catch (error: any) {
            console.error('Batch create error:', error);
            alert('Hata', 'Toplu oluşturma sırasında hata: ' + error.message, [], { type: 'error' });
        } finally {
            setDevLoading(null);
        }
    };

    const handleUpcomingMatchScenario = async () => {
        if (!user) return;
        setDevLoading('upcoming_match');
        try {
            const matchId = await createUpcomingMatchScenario(user.uid);
            alert('Başarılı', `Gelecek maç senaryosu oluşturuldu. Maç ID: ${matchId}`, [
                {
                    text: 'Maça Git',
                    onPress: () => router.push(`/match/${matchId}`)
                }
            ], { type: 'success' });
        } catch (error: any) {
            console.error(error);
            alert('Hata', 'Gelecek maç senaryosu başlatılamadı: ' + error.message, [], { type: 'error' });
        } finally {
            setDevLoading(null);
        }
    };

    const handleFinishedMatchScenario = async () => {
        if (!user) return;
        setDevLoading('finished_match');
        try {
            const matchId = await createFinishedMatchScenario(user.uid);
            alert('Başarılı', `Oynanmış maç senaryosu oluşturuldu (Skor 5-4). Maç ID: ${matchId}`, [
                {
                    text: 'Maça Git',
                    onPress: () => router.push(`/match/${matchId}`)
                }
            ], { type: 'success' });
        } catch (error: any) {
            console.error(error);
            alert('Hata', 'Oynanmış maç senaryosu başlatılamadı: ' + error.message, [], { type: 'error' });
        } finally {
            setDevLoading(null);
        }
    };

    const handleMvpVotingScenario = async () => {
        if (!user) return;
        setDevLoading('mvp_voting');
        try {
            const matchId = await simulateMvpVotingScenario(user.uid);
            alert('Başarılı', `MVP oylama senaryosu başlatıldı ve 5 mock oy simüle edildi. Maç ID: ${matchId}`, [
                {
                    text: 'Oylamaya Git',
                    onPress: () => router.push(`/match/${matchId}/mvp-vote`)
                }
            ], { type: 'success' });
        } catch (error: any) {
            console.error(error);
            alert('Hata', 'MVP oylama senaryosu başlatılamadı: ' + error.message, [], { type: 'error' });
        } finally {
            setDevLoading(null);
        }
    };

    const handleDisputeFlowScenario = async () => {
        if (!user) return;
        setDevLoading('dispute_flow');
        try {
            const result = await simulateDisputeFlowScenario(user.uid);
            alert('Başarılı', `İtiraz senaryosu başlatıldı. Test Player 1 gol sayısına itiraz etti. Maç ID: ${result.matchId}`, [
                {
                    text: 'İtirazı İncele',
                    onPress: () => router.push(`/match/${result.matchId}`)
                }
            ], { type: 'success' });
        } catch (error: any) {
            console.error(error);
            alert('Hata', 'İtiraz senaryosu başlatılamadı: ' + error.message, [], { type: 'error' });
        } finally {
            setDevLoading(null);
        }
    };

    const handleResetTestData = async () => {
        setDevLoading('reset_test_data');
        try {
            const result = await resetTestDataScenario();
            alert('Başarılı', `Tüm simülasyon verileri silindi ve test oyuncularının kariyer istatistikleri sıfırlandı. Temizlenen maç sayısı: ${result.resetCount}`, [], { type: 'success' });
        } catch (error: any) {
            console.error(error);
            alert('Hata', 'Test verileri sıfırlanamadı: ' + error.message, [], { type: 'error' });
        } finally {
            setDevLoading(null);
        }
    };

    const handleRecalculateCounts = async () => {
        if (devLoading) return;
        setDevLoading('recalc');

        try {
            const { collection, getDocs, doc, updateDoc, getCountFromServer } = await import('firebase/firestore');

            // Get all users
            const usersSnap = await getDocs(collection(db, "users"));
            let updatedCount = 0;

            for (const userDoc of usersSnap.docs) {
                const userId = userDoc.id;

                // Count followers
                const followersColl = collection(db, "users", userId, "followers");
                const followersSnap = await getCountFromServer(followersColl);
                const actualFollowers = followersSnap.data().count;

                // Count following
                const followingColl = collection(db, "users", userId, "following");
                const followingSnap = await getCountFromServer(followingColl);
                const actualFollowing = followingSnap.data().count;

                // Update if different
                const data = userDoc.data();
                if (data.followersCount !== actualFollowers || data.followingCount !== actualFollowing) {
                    await updateDoc(doc(db, "users", userId), {
                        followersCount: actualFollowers,
                        followingCount: actualFollowing
                    });
                    updatedCount++;
                }
            }

            alert('Başarılı', `${updatedCount} kullanıcının sayaçları düzeltildi.`, [], { type: 'success' });

        } catch (error: any) {
            console.error(error);
            alert('Hata', 'Sayaç düzeltme hatası: ' + error.message, [], { type: 'error' });
        } finally {
            setDevLoading(null);
        }
    };

    const handleCreateSpecialUsers = async () => {
        if (devLoading) return;
        setDevLoading('special_users');
        try {
            const { createdCount, updatedCount, errors } = await createSpecialUsers();
            if (errors.length > 0) {
                alert('Tamamlandı (Hatalarla)', `Yeni: ${createdCount}, Güncellenen: ${updatedCount}\n\nHatalar:\n${errors.join('\n')}`, [], { type: 'warning' });
            } else {
                alert('Başarılı', `${createdCount} yeni oyuncu oluşturuldu, ${updatedCount} oyuncu güncellendi.`, [], { type: 'success' });
            }
        } catch (error: any) {
            alert('Hata', error.message, [], { type: 'error' });
        } finally {
            setDevLoading(null);
        }
    };

    const handleAddAllToGroup = async () => {
        if (devLoading) return;
        setDevLoading('add_all_group');
        alert(
            "Onay",
            "Tüm kullanıcılar MUMShAaabo68tcV9kdhK grubuna eklenecek. İşlem uzun sürebilir.",
            [
                { text: "İptal", style: "cancel", onPress: () => setDevLoading(null) },
                {
                    text: "Evet, Başlat",
                    onPress: async () => {
                        try {
                            await addAllUsersToGroup();
                            alert("Başarılı", "Tüm kullanıcılar gruba eklendi.", [], { type: 'success' });
                        } catch (error: any) {
                            alert("Hata", error.message, [], { type: 'error' });
                        } finally {
                            setDevLoading(null);
                        }
                    }
                }
            ],
            { type: 'warning' }
        );
    };

    const handleDevLogin = async (type: 'admin' | 'player' | 'guest' | 'custom', index?: number) => {
        const loadingKey = type === 'player' && index ? `player-${index}` : type;
        if (devLoading) return;
        if (type !== 'custom' && !hasDevTestPassword()) {
            alert('Hata', DEV_CREDENTIALS_MISSING_MESSAGE, [], { type: 'error' });
            return;
        }
        setDevLoading(loadingKey);

        let target = {
            email: '',
            password: DEV_TEST_PASSWORD,
            name: '',
            username: '',
            rating: 5.0
        };

        if (type === 'custom') {
            if (!hasDevOwnerCredentials()) {
                setDevLoading(null);
                alert('Hata', DEV_CREDENTIALS_MISSING_MESSAGE, [], { type: 'error' });
                return;
            }
            const { collection, query, where, getDocs } = await import('firebase/firestore');
            const q = query(collection(db, "users"), where("username", "==", DEV_OWNER_USERNAME));
            const snapshot = await getDocs(q);
            if (!snapshot.empty) {
                target.email = snapshot.docs[0].data().email;
                target.password = DEV_OWNER_PASSWORD;
            } else {
                setDevLoading(null);
                alert('Hata', `${DEV_OWNER_USERNAME} kullanıcısı bulunamadı.`, [], { type: 'error' });
                return;
            }
        }
        else if (type === 'admin') {
            target = {
                email: 'admin@halisaha.com',
                password: DEV_TEST_PASSWORD,
                name: 'Admin User',
                username: 'admin_user',
                rating: 9.9
            };
        } else if (type === 'guest') {
            target = {
                email: 'guest@halisaha.com',
                password: DEV_TEST_PASSWORD,
                name: 'Guest User',
                username: 'guest_user',
                rating: 5.0
            };
        } else if (type === 'player' && index) {
            target = {
                email: `player${index}@halisaha.com`,
                password: DEV_TEST_PASSWORD,
                name: `Test Player ${index}`,
                username: `test_player_${index}`,
                rating: 5.0 + (index * 0.2) // Give them varied ratings
            };
        }

        try {
            await signOut(auth); // Sign out first
            await signInWithEmailAndPassword(auth, target.email, target.password);
            router.replace('/(tabs)');
        } catch (loginError: any) {
            console.log("Login failed...", loginError.code);
            alert('Giriş Hatası', loginError.message, [], { type: 'error' });
        } finally {
            setDevLoading(null);
        }
    };

    const handleLogout = async () => {
        alert(
            'Çıkış Yap',
            'Çıkış yapmak istediğinizden emin misiniz?',
            [
                { text: 'İptal', style: 'cancel' },
                {
                    text: 'Çıkış Yap',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await signOut(auth);
                            router.replace('/auth/login');
                        } catch (error) {
                            console.error(error);
                            alert('Hata', 'Çıkış yapılırken bir hata oluştu', [], { type: 'error' });
                        }
                    }
                }
            ],
            { type: 'warning', icon: 'log-out-outline' }
        );
    };

    const handleChangePassword = async () => {
        if (!currentPassword || !newPassword || !confirmPassword) {
            alert('Hata', 'Tüm alanları doldurunuz', [], { type: 'warning' });
            return;
        }

        if (newPassword !== confirmPassword) {
            alert('Hata', 'Yeni şifreler eşleşmiyor', [], { type: 'error' });
            return;
        }

        if (newPassword.length < 6) {
            alert('Hata', 'Şifre en az 6 karakter olmalıdır', [], { type: 'warning' });
            return;
        }

        if (!user?.email) {
            alert('Hata', 'Kullanıcı bilgisi bulunamadı', [], { type: 'error' });
            return;
        }

        setPasswordLoading(true);
        try {
            // Re-authenticate user
            const credential = EmailAuthProvider.credential(user.email, currentPassword);
            await reauthenticateWithCredential(auth.currentUser!, credential);

            // Update password
            await updatePassword(auth.currentUser!, newPassword);

            alert('Başarılı', 'Şifreniz değiştirildi', [], { type: 'success' });
            setShowPasswordModal(false);
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');
        } catch (error: any) {
            console.error(error);
            if (error.code === 'auth/wrong-password') {
                alert('Hata', 'Mevcut şifreniz yanlış', [], { type: 'error' });
            } else if (error.code === 'auth/requires-recent-login') {
                alert('Hata', 'Güvenlik nedeniyle yeniden giriş yapmanız gerekiyor', [], { type: 'warning' });
            } else {
                alert('Hata', 'Şifre değiştirilemedi', [], { type: 'error' });
            }
        } finally {
            setPasswordLoading(false);
        }
    };

    // Handle Account Deletion
    const closeDeleteModal = () => {
        setShowDeleteModal(false);
        setDeletePassword('');
        setDeleteReason('');
    };

    const handleDeleteAccount = async () => {
        if (!deletePassword) {
            alert('Hata', deleteWithPassword ? 'Lütfen şifreni gir.' : `Onaylamak için ${DELETE_CONFIRM_WORD} yaz.`, [], { type: 'warning' });
            return;
        }

        setDeleteLoading(true);
        try {
            const result = await deleteUserAccount(
                deleteWithPassword
                    ? { password: deletePassword, reason: deleteReason }
                    : { confirmation: deletePassword, reason: deleteReason }
            );
            if (result.success) {
                closeDeleteModal();
                router.replace('/settings/account-deleted');
            } else {
                alert('Hata', result.error || 'Hesap silinemedi', [], { type: 'error' });
            }
        } catch {
            alert('Hata', 'Hesap silinirken bir hata oluştu', [], { type: 'error' });
        } finally {
            setDeleteLoading(false);
            setDeletePassword('');
        }
    };

    // Handle Share App
    const handleShareApp = async () => {
        try {
            await Share.share({
                message: 'MaçVar - Halı Saha Organizasyonu & Kadro Kur uygulamasını indirin!',
                // iOS'da URL ayrı gösterilir
                url: 'https://apps.apple.com/app/macvar', // Placeholder - gerçek link eklenecek
            });
        } catch (error) {
            console.log('Share error:', error);
        }
    };

    // Handle Contact Support
    const handleContactSupport = () => {
        Linking.openURL('mailto:destek@macvar.com?subject=MaçVar%20Destek');
    };

    // App Version
    const appVersion = Constants.expoConfig?.version || '1.0.0';

    const closePasswordModal = () => {
        setShowPasswordModal(false);
        setCurrentPassword('');
        setNewPassword('');
        setConfirmPassword('');
    };

    const confirmDeleteAccount = () => {
        alert(
            'Hesabı Sil',
            `Hesabın ${ACCOUNT_GRACE_DAYS} gün sonra kalıcı olarak silinecek. Bu süre içinde tekrar giriş yaparsan geri yükleyebilirsin. Yaklaşan maç kayıtların hemen iptal edilir.`,
            [
                { text: 'İptal', style: 'cancel' },
                { text: 'Devam Et', style: 'destructive', onPress: () => setShowDeleteModal(true) }
            ],
            { type: 'warning' }
        );
    };

    const themeLabel = THEME_OPTIONS.find(o => o.value === themeMode)?.label ?? 'Sistem';
    const inputStyle = [st.modalInput, { backgroundColor: C.input, borderColor: C.border, color: C.text }];

    const devScenarios = [
        { key: 'upcoming_match', title: '1. Gelecek Maç Senaryosu', desc: 'Gelecek bir maç oluşturur, 14 test oyuncusunu kaydeder ve A/B takımlarına böler.', onPress: handleUpcomingMatchScenario },
        { key: 'finished_match', title: '2. Oynanmış Maç Senaryosu', desc: 'Skoru 5-4 bitmiş, 14 oyuncunun da bireysel performans istatistikleri girilmiş bir maç simüle eder.', onPress: handleFinishedMatchScenario },
        { key: 'mvp_voting', title: '3. MVP Oylama Senaryosu', desc: 'Oynanmış maç oluşturup MVP oylama penceresini açar. Test oyuncularından 5 mock oy simüle eder.', onPress: handleMvpVotingScenario },
        { key: 'dispute_flow', title: '4. İtiraz (Dispute) Akışı Senaryosu', desc: 'Oynanmış maç oluşturur ve bir test oyuncusunun gol sayısına itiraz (dispute) etmesini sağlar.', onPress: handleDisputeFlowScenario },
    ];

    const devTools = [
        { key: 'batch', label: '1. Test Oyuncularını Oluştur/Güncelle', onPress: handleBatchCreate },
        { key: 'special_users', label: '2. Özel Oyuncuları Oluştur (Timur, Emir vb.)', onPress: handleCreateSpecialUsers },
        { key: 'add_all_group', label: '3. Tüm Test Oyuncularını Gruba Ekle', onPress: handleAddAllToGroup },
        { key: 'recalc', label: '4. Takipçi Sayaçlarını Düzelt', onPress: handleRecalculateCounts },
    ];

    // Derived from the seed roster so the two never drift apart.
    const devAccounts = SPECIAL_USERS.map(u => ({
        label: u.name.replace(/^Test /, ''),
        email: testAccountEmail(u.name),
    }));

    const devLabelStyle = [st.devLabel, { color: C.textSecondary }];

    return (
        <SettingsLayout title="Ayarlar" onTitlePress={handleDevTap}>
            <KeyboardAvoidingView
                behavior={Platform.OS === "ios" ? "padding" : undefined}
                style={{ flex: 1 }}
            >
                <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Premium Banner */}
                    <TouchableOpacity activeOpacity={0.85} onPress={() => router.push('/settings/premium')}>
                        <LinearGradient
                            colors={C.isDark ? [palette.darkGreen, palette.darkStart] : [palette.green, palette.darkGreen]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 1 }}
                            style={[st.premiumBanner, { borderColor: C.isDark ? palette.darkGreen : palette.transparent }]}
                        >
                            <View style={{ flex: 1 }}>
                                <Text style={[st.premiumEyebrow, { color: C.isDark ? palette.greenBright : withOpacity(palette.white, 0.85) }]}>
                                    {isPremium ? `${TIER_LABELS[tier] ?? 'Premium'} · Aktif` : 'Kaptan Pro'}
                                </Text>
                                <Text style={[st.premiumTitle, { color: palette.white }]}>
                                    {isPremium ? 'Aboneliğini yönet' : 'Sınırsız maç & Akıllı Kadro'}
                                </Text>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color={palette.white} />
                        </LinearGradient>
                    </TouchableOpacity>

                    {/* Developer Tools Section - Hidden by default */}
                    {__DEV__ && showDevOptions && (
                        <>
                            <SectionLabel style={{ color: C.primaryText }}>👨‍💻 Geliştirici Araçları</SectionLabel>
                            <View style={[st.devCard, { backgroundColor: C.card, borderColor: C.border }]}>
                                <Text style={devLabelStyle}>🎯 Uçtan Uca (E2E) Senaryoları</Text>

                                {devScenarios.map(s => (
                                    <View key={s.key} style={[st.devBlock, { backgroundColor: C.input }]}>
                                        <Text style={[st.devTitle, { color: C.text }]}>{s.title}</Text>
                                        <Text style={[st.devDesc, { color: C.textSecondary }]}>{s.desc}</Text>
                                        <TouchableOpacity
                                            onPress={s.onPress}
                                            disabled={!!devLoading}
                                            style={[st.devAction, { backgroundColor: C.primary }]}
                                        >
                                            {devLoading === s.key ? <ActivityIndicator color={C.onPrimary} size="small" /> : (
                                                <Text style={[st.devActionText, { color: C.onPrimary }]}>Senaryoyu Çalıştır</Text>
                                            )}
                                        </TouchableOpacity>
                                    </View>
                                ))}

                                <View style={[st.devBlock, { backgroundColor: C.input, borderWidth: 1, borderColor: withOpacity(C.error, 0.3) }]}>
                                    <Text style={[st.devTitle, { color: C.error }]}>5. Test Verilerini Sıfırla</Text>
                                    <Text style={[st.devDesc, { color: C.textSecondary }]}>
                                        Tüm simülasyon maçlarını (`isSimulation: true`), itirazları, MVP oturumlarını siler ve test oyuncu istatistiklerini sıfırlar.
                                    </Text>
                                    <TouchableOpacity
                                        onPress={handleResetTestData}
                                        disabled={!!devLoading}
                                        style={[st.devAction, { backgroundColor: C.error }]}
                                    >
                                        {devLoading === 'reset_test_data' ? <ActivityIndicator color={C.onPrimary} size="small" /> : (
                                            <Text style={[st.devActionText, { color: C.onPrimary }]}>Test Verilerini Temizle</Text>
                                        )}
                                    </TouchableOpacity>
                                </View>

                                <View style={[st.devDivider, { backgroundColor: C.divider }]} />
                                <Text style={devLabelStyle}>🛠️ Yardımcı Araçlar & Paneller</Text>

                                {devTools.map(t => (
                                    <TouchableOpacity
                                        key={t.key}
                                        onPress={t.onPress}
                                        disabled={!!devLoading}
                                        style={[st.devTool, { backgroundColor: C.input, borderColor: C.border }]}
                                    >
                                        {devLoading === t.key ? <ActivityIndicator color={C.text} size="small" /> : (
                                            <Text style={[st.devToolText, { color: C.text }]}>{t.label}</Text>
                                        )}
                                    </TouchableOpacity>
                                ))}

                                <TouchableOpacity
                                    onPress={() => router.push('/settings/test-lab')}
                                    style={[st.devTool, { backgroundColor: C.input, borderColor: C.primaryText }]}
                                >
                                    <Text style={[st.devToolText, { color: C.primaryText, fontWeight: '700' }]}>🧪 Test Lab (Bot Kullanıcılarla Çok Oyunculu Test)</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => router.push('/settings/admin')}
                                    style={[st.devTool, { backgroundColor: C.input, borderColor: C.primaryText }]}
                                >
                                    <Text style={[st.devToolText, { color: C.primaryText, fontWeight: '700' }]}>🛡️ Sistem Admin Paneli (Şikayetler & Silinenler)</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => router.push('/settings/manual-stats')}
                                    style={[st.devTool, { backgroundColor: C.input, borderColor: C.info }]}
                                >
                                    <Text style={[st.devToolText, { color: C.textSecondary, fontWeight: '700' }]}>✍️ Manuel İstatistik Girişi</Text>
                                </TouchableOpacity>

                                {/* Account Switching */}
                                <View style={[st.devDivider, { backgroundColor: C.divider }]} />
                                <Text style={devLabelStyle}>🔄 Hızlı Hesap Geçişi</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                    <TouchableOpacity
                                        onPress={() => handleDevLogin('custom')}
                                        disabled={!!devLoading}
                                        style={[st.devChip, { backgroundColor: C.primary, borderColor: C.primary }, !!devLoading && { opacity: 0.5 }]}
                                    >
                                        {devLoading === 'custom' ? <ActivityIndicator color={C.onPrimary} size="small" /> : (
                                            <Text style={[st.devChipText, { color: C.onPrimary }]}>{DEV_OWNER_USERNAME || 'Kendi hesabım'}</Text>
                                        )}
                                    </TouchableOpacity>
                                    {devAccounts.map(u => (
                                        <TouchableOpacity
                                            key={u.email}
                                            onPress={async () => {
                                                if (devLoading) return;
                                                if (!hasDevTestPassword()) {
                                                    alert('Hata', DEV_CREDENTIALS_MISSING_MESSAGE, [], { type: 'error' });
                                                    return;
                                                }
                                                setDevLoading(u.email);
                                                try {
                                                    await signOut(auth);
                                                    await signInWithEmailAndPassword(auth, u.email, DEV_TEST_PASSWORD);
                                                    router.replace('/(tabs)');
                                                } catch (e: any) {
                                                    alert('Giriş Hatası', e.message, [], { type: 'error' });
                                                } finally {
                                                    setDevLoading(null);
                                                }
                                            }}
                                            disabled={!!devLoading}
                                            style={[st.devChip, { backgroundColor: C.input, borderColor: C.border }, !!devLoading && { opacity: 0.5 }]}
                                        >
                                            {devLoading === u.email ? <ActivityIndicator color={C.text} size="small" /> : (
                                                <Text style={[st.devChipText, { color: C.text }]}>{u.label}</Text>
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        </>
                    )}

                    <SectionLabel>Hesap</SectionLabel>
                    <SettingsRow icon="person-outline" label="Profili Düzenle" onPress={() => router.push('/edit-profile')} />
                    <SettingsRow icon="lock-closed-outline" label="Şifre Değiştir" onPress={() => setShowPasswordModal(true)} />
                    <SettingsRow icon="notifications-outline" label="Bildirim Ayarları" onPress={() => router.push('/settings/notifications')} />
                    <SettingsRow icon="shield-outline" label="Tatil / Sakatlık Modu" onPress={() => router.push('/settings/vacation')} last />

                    <SectionLabel>Görünüm</SectionLabel>
                    <SettingsRow
                        ref={themeMenu.anchorRef}
                        icon="moon-outline"
                        label="Tema"
                        value={themeLabel}
                        onPress={themeMenu.open}
                        last
                    />

                    <SectionLabel>Destek</SectionLabel>
                    <SettingsRow icon="chatbubble-outline" label="Destek E-postası Gönder" onPress={handleContactSupport} />
                    <SettingsRow icon="share-social-outline" label="Arkadaşlarına Öner" onPress={handleShareApp} />
                    <SettingsRow
                        ref={legalMenu.anchorRef}
                        icon="document-text-outline"
                        label="Yasal Sözleşmeler"
                        onPress={legalMenu.open}
                        last
                    />

                    <TouchableOpacity
                        onPress={handleLogout}
                        activeOpacity={0.7}
                        style={[st.logoutBtn, { backgroundColor: C.card, borderColor: C.border }]}
                    >
                        <Text style={[st.logoutText, { color: C.error }]}>Çıkış Yap</Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={confirmDeleteAccount} style={st.deleteLink} hitSlop={8}>
                        <Text style={[st.deleteText, { color: C.textTertiary }]}>Hesabı Kalıcı Olarak Sil</Text>
                    </TouchableOpacity>

                    <Text style={[st.version, { color: C.textTertiary }]}>MaçVar · Sürüm {appVersion}</Text>
                </ScrollView>
            </KeyboardAvoidingView>

            <AnchoredMenu
                anchor={themeMenu.anchor}
                options={THEME_OPTIONS}
                selected={themeMode}
                onSelect={setThemeMode}
                onClose={themeMenu.close}
            />
            <AnchoredMenu
                anchor={legalMenu.anchor}
                options={LEGAL_OPTIONS}
                onSelect={(route) => router.push(route)}
                onClose={legalMenu.close}
            />

            {/* Password Change Modal */}
            <Modal
                visible={showPasswordModal}
                transparent={true}
                animationType="fade"
                onRequestClose={closePasswordModal}
            >
                <View style={[st.modalBackdrop, { backgroundColor: C.overlay }]}>
                    <View style={[st.modalCard, { backgroundColor: C.sheet, borderColor: C.border }]}>
                        <Text style={[st.modalTitle, { color: C.text }]}>Şifre Değiştir</Text>

                        <TextInput
                            value={currentPassword}
                            onChangeText={setCurrentPassword}
                            secureTextEntry
                            style={inputStyle}
                            placeholder="Mevcut Şifre"
                            placeholderTextColor={C.placeholder}
                        />
                        <TextInput
                            value={newPassword}
                            onChangeText={setNewPassword}
                            secureTextEntry
                            style={inputStyle}
                            placeholder="Yeni Şifre"
                            placeholderTextColor={C.placeholder}
                        />
                        <TextInput
                            value={confirmPassword}
                            onChangeText={setConfirmPassword}
                            secureTextEntry
                            style={inputStyle}
                            placeholder="Yeni Şifre (Tekrar)"
                            placeholderTextColor={C.placeholder}
                        />

                        <View style={st.modalActions}>
                            <TouchableOpacity
                                onPress={closePasswordModal}
                                style={[st.modalBtn, { backgroundColor: C.input, borderColor: C.border, borderWidth: 1 }]}
                            >
                                <Text style={[st.modalBtnText, { color: C.text }]}>İptal</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleChangePassword}
                                disabled={passwordLoading}
                                style={[st.modalBtn, { backgroundColor: C.primary, opacity: passwordLoading ? 0.5 : 1 }]}
                            >
                                {passwordLoading ? <ActivityIndicator color={C.onPrimary} size="small" /> : (
                                    <Text style={[st.modalBtnText, { color: C.onPrimary }]}>Değiştir</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Delete Account Modal */}
            <Modal
                visible={showDeleteModal}
                transparent={true}
                animationType="fade"
                onRequestClose={closeDeleteModal}
            >
                <View style={[st.modalBackdrop, { backgroundColor: C.overlay }]}>
                    <View style={[st.modalCard, { backgroundColor: C.sheet, borderColor: C.border }]}>
                        <View style={[st.warningIcon, { backgroundColor: withOpacity(C.error, 0.12) }]}>
                            <Ionicons name="warning-outline" size={32} color={C.error} />
                        </View>

                        <Text style={[st.modalTitle, { color: C.error }]}>Hesabı Sil</Text>

                        <Text style={[st.modalDesc, { color: C.textSecondary }]}>
                            Hesabın {ACCOUNT_GRACE_DAYS} gün sonra kalıcı olarak silinir; profilin, grup üyeliklerin ve bildirimlerin kaldırılır. Bu süre içinde giriş yaparsan hesabını geri yükleyebilirsin.
                        </Text>

                        <TextInput
                            value={deletePassword}
                            onChangeText={setDeletePassword}
                            secureTextEntry={deleteWithPassword}
                            autoCapitalize={deleteWithPassword ? 'none' : 'characters'}
                            autoCorrect={false}
                            style={[inputStyle, { borderColor: C.error }]}
                            placeholder={deleteWithPassword ? 'Şifreni onayla' : `Onaylamak için ${DELETE_CONFIRM_WORD} yaz`}
                            placeholderTextColor={C.placeholder}
                        />
                        <TextInput
                            value={deleteReason}
                            onChangeText={setDeleteReason}
                            maxLength={500}
                            style={[inputStyle, { marginTop: 10 }]}
                            placeholder="Neden ayrılıyorsun? (isteğe bağlı)"
                            placeholderTextColor={C.placeholder}
                        />

                        <View style={st.modalActions}>
                            <TouchableOpacity
                                onPress={closeDeleteModal}
                                style={[st.modalBtn, { backgroundColor: C.input, borderColor: C.border, borderWidth: 1 }]}
                            >
                                <Text style={[st.modalBtnText, { color: C.text }]}>İptal</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleDeleteAccount}
                                disabled={deleteLoading || !deletePassword}
                                style={[st.modalBtn, { backgroundColor: C.error, opacity: (deleteLoading || !deletePassword) ? 0.5 : 1 }]}
                            >
                                {deleteLoading ? (
                                    <ActivityIndicator color={C.onPrimary} size="small" />
                                ) : (
                                    <Text style={[st.modalBtnText, { color: C.onPrimary }]}>Hesabı Sil</Text>
                                )}
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </SettingsLayout>
    );
}

const st = StyleSheet.create({
    premiumBanner: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        borderRadius: 20,
        borderWidth: 1,
        padding: 18,
        marginTop: 4,
        marginBottom: 2,
    },
    premiumEyebrow: {
        fontSize: 11,
        fontWeight: '800',
        letterSpacing: 0.6,
        textTransform: 'uppercase',
    },
    premiumTitle: {
        fontSize: 15,
        fontWeight: '700',
        marginTop: 3,
    },
    logoutBtn: {
        borderWidth: 1,
        borderRadius: 16,
        paddingVertical: 14,
        alignItems: 'center',
        marginTop: 26,
    },
    logoutText: {
        fontSize: 15,
        fontWeight: '700',
    },
    deleteLink: {
        alignSelf: 'center',
        marginTop: 16,
    },
    deleteText: {
        fontSize: 12,
        fontWeight: '600',
    },
    version: {
        textAlign: 'center',
        fontSize: 11,
        marginTop: 18,
    },
    devCard: {
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        marginTop: 4,
    },
    devLabel: {
        fontWeight: '700',
        fontSize: 13,
        marginBottom: 12,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
    },
    devBlock: {
        marginBottom: 12,
        padding: 12,
        borderRadius: 12,
    },
    devTitle: {
        fontWeight: '700',
        fontSize: 14,
        marginBottom: 4,
    },
    devDesc: {
        fontSize: 12,
        marginBottom: 10,
    },
    devAction: {
        paddingVertical: 10,
        borderRadius: 8,
        alignItems: 'center',
        justifyContent: 'center',
    },
    devActionText: {
        fontWeight: '700',
        fontSize: 13,
    },
    devDivider: {
        height: 1,
        marginVertical: 14,
    },
    devTool: {
        padding: 12,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 1,
        marginBottom: 8,
    },
    devToolText: {
        fontWeight: '600',
        fontSize: 13,
    },
    devChip: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
    },
    devChipText: {
        fontWeight: '600',
        fontSize: 12,
    },
    modalBackdrop: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
    },
    modalCard: {
        width: '100%',
        maxWidth: 360,
        padding: 24,
        borderRadius: 24,
        borderWidth: 1,
        gap: 14,
    },
    modalTitle: {
        fontSize: 20,
        fontWeight: '800',
        textAlign: 'center',
    },
    modalDesc: {
        textAlign: 'center',
        fontSize: 14,
        lineHeight: 20,
    },
    modalInput: {
        borderWidth: 1,
        borderRadius: 14,
        height: 50,
        paddingHorizontal: 16,
        fontSize: 15,
    },
    modalActions: {
        flexDirection: 'row',
        gap: 12,
        marginTop: 6,
    },
    modalBtn: {
        flex: 1,
        height: 50,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
    },
    modalBtnText: {
        fontSize: 15,
        fontWeight: '700',
    },
    warningIcon: {
        width: 64,
        height: 64,
        borderRadius: 32,
        alignItems: 'center',
        justifyContent: 'center',
        alignSelf: 'center',
    },
});
