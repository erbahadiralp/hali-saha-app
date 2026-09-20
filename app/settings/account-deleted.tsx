import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { signOut } from 'firebase/auth';
import { LinearGradient } from 'expo-linear-gradient';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SecondaryButton } from '../../components/group/GroupUI';
import { useSettingsColors } from '../../components/settings/SettingsUI';
import { withOpacity } from '../../constants/designTokens';
import { auth } from '../../firebaseConfig';

/** Layout: design/tasarım/macvar-screens-6.html (Hesap Silme Onay); colors from designTokens. */

const REDIRECT_SECONDS = 5;

export default function AccountDeletedScreen() {
    const router = useRouter();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();
    const [countdown, setCountdown] = useState(REDIRECT_SECONDS);
    const leaving = useRef(false);

    const iconScale = useState(() => new Animated.Value(0.6))[0];
    const fade = useState(() => new Animated.Value(0))[0];
    const spin = useState(() => new Animated.Value(0))[0];

    useEffect(() => {
        Animated.parallel([
            Animated.spring(iconScale, { toValue: 1, friction: 5, tension: 60, useNativeDriver: true }),
            Animated.timing(fade, { toValue: 1, duration: 500, delay: 150, useNativeDriver: true }),
        ]).start();
        const loop = Animated.loop(Animated.timing(spin, { toValue: 1, duration: 1000, easing: Easing.linear, useNativeDriver: true }));
        loop.start();
        return () => loop.stop();
    }, [iconScale, fade, spin]);

    const leave = useCallback(async () => {
        if (leaving.current) return;
        leaving.current = true;
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Sign out after deletion failed:', error);
        }
        router.replace('/auth/login');
    }, [router]);

    useEffect(() => {
        if (countdown <= 0) {
            leave();
            return;
        }
        const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
        return () => clearTimeout(timer);
    }, [countdown, leave]);

    const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

    return (
        <View style={[st.root, { backgroundColor: C.background, paddingTop: insets.top, paddingBottom: insets.bottom + 16 }]}>
            <LinearGradient colors={[C.gradient[0], C.gradient[1]]} style={StyleSheet.absoluteFill} />

            <Animated.View style={[st.icon, { backgroundColor: withOpacity(C.error, 0.14), transform: [{ scale: iconScale }] }]}>
                <Ionicons name="trash-outline" size={40} color={C.error} />
            </Animated.View>

            <Animated.View style={{ opacity: fade, alignItems: 'center' }}>
                <Text style={[st.title, { color: C.text }]}>Hesabın Silindi</Text>
                <Text style={[st.text, { color: C.textSecondary }]}>
                    Silme talebin başarıyla alındı. 30 gün içinde tekrar giriş yaparsan hesabını kurtarabilirsin.
                </Text>

                <View style={st.ringWrap}>
                    <View style={[st.ring, { borderColor: C.segment }]} />
                    <Animated.View style={[st.ring, { borderColor: C.transparent, borderTopColor: C.error, transform: [{ rotate }] }]} />
                    <Text style={[st.ringValue, { color: C.text }]}>{Math.max(0, countdown)}</Text>
                </View>
                <Text style={[st.hint, { color: C.textTertiary }]}>saniye içinde giriş ekranına yönlendirileceksin</Text>
            </Animated.View>

            <View style={{ flex: 1 }} />
            <SecondaryButton label="Şimdi Çıkış Yap" onPress={leave} style={st.button} />
        </View>
    );
}

const RING = 64;

const st = StyleSheet.create({
    root: { flex: 1, alignItems: 'center', paddingHorizontal: 24 },
    icon: { width: 88, height: 88, borderRadius: 44, alignItems: 'center', justifyContent: 'center', marginTop: 56, marginBottom: 24 },
    title: { fontSize: 28, fontWeight: '800', letterSpacing: -0.5, marginBottom: 10, textAlign: 'center' },
    text: { fontSize: 14, fontWeight: '600', lineHeight: 22, textAlign: 'center', paddingHorizontal: 8, marginBottom: 28 },
    ringWrap: { width: RING, height: RING, alignItems: 'center', justifyContent: 'center' },
    ring: { position: 'absolute', width: RING, height: RING, borderRadius: RING / 2, borderWidth: 4 },
    ringValue: { fontSize: 18, fontWeight: '800' },
    hint: { fontSize: 12, fontWeight: '600', marginTop: 10, textAlign: 'center' },
    button: { alignSelf: 'stretch' },
});
