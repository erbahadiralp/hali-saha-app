import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Animated, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import StadiumHero from '../../components/auth/StadiumHero';
import { PrimaryButton } from '../../components/group/GroupUI';
import { useSettingsColors } from '../../components/settings/SettingsUI';

/** Layout: design/splash-welcome.png (Karşılama); colors from designTokens. */

export default function WelcomeScreen() {
    const router = useRouter();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();
    const { height } = useWindowDimensions();

    const rise = useState(() => new Animated.Value(24))[0];
    const fade = useState(() => new Animated.Value(0))[0];

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fade, { toValue: 1, duration: 450, useNativeDriver: true }),
            Animated.spring(rise, { toValue: 0, friction: 8, useNativeDriver: true }),
        ]).start();
    }, [fade, rise]);

    return (
        <View style={[st.root, { backgroundColor: C.background }]}>
            <StadiumHero fadeTo={C.background} style={{ height: height * 0.58 }} />

            <Animated.View
                style={[
                    st.card,
                    {
                        backgroundColor: C.isDark ? C.card : C.surface,
                        borderColor: C.border,
                        marginBottom: insets.bottom + 16,
                        opacity: fade,
                        transform: [{ translateY: rise }],
                    },
                ]}
            >
                <Text style={[st.title, { color: C.text }]}>HALISAHA</Text>
                <Text style={[st.tagline, { color: C.link }]}>Sahaya çık, farkını göster.</Text>
                <Text style={[st.text, { color: C.textSecondary }]}>
                    Türkiye&apos;nin en aktif halısaha topluluğuna katıl. Maç yap, puan al, zirveye oyna!
                </Text>
                <PrimaryButton label="Hemen Başla" icon="arrow-forward" onPress={() => router.push('/auth/login')} style={st.button} />
            </Animated.View>
        </View>
    );
}

const st = StyleSheet.create({
    root: { flex: 1, justifyContent: 'space-between' },
    card: {
        marginHorizontal: 16,
        marginTop: -48,
        borderRadius: 28,
        borderWidth: 1,
        paddingHorizontal: 24,
        paddingTop: 30,
        paddingBottom: 24,
        alignItems: 'center',
    },
    title: { fontSize: 40, fontWeight: '800', letterSpacing: 0.5 },
    tagline: { fontSize: 16, fontWeight: '700', marginTop: 6 },
    text: { fontSize: 14, fontWeight: '500', lineHeight: 22, textAlign: 'center', marginTop: 22, marginBottom: 26 },
    button: { alignSelf: 'stretch' },
});
