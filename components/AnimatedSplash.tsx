import React, { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View, useColorScheme, useWindowDimensions } from 'react-native';
import { getThemeColors, palette } from '../constants/designTokens';
import StadiumHero from './auth/StadiumHero';

/**
 * Launch overlay shown while fonts and the saved theme load.
 * Visual: the stadium hero and brand from design/splash-welcome.png; colors from designTokens.
 * The saved theme isn't known yet, so the ground follows the system scheme.
 */

interface AnimatedSplashProps {
    isReady: boolean;
    onAnimationComplete: () => void;
}

export default function AnimatedSplash({ isReady, onAnimationComplete }: AnimatedSplashProps) {
    const isDark = useColorScheme() === 'dark';
    const T = getThemeColors(isDark);
    const { height } = useWindowDimensions();

    const heroScale = useState(() => new Animated.Value(1.08))[0];
    const textOpacity = useState(() => new Animated.Value(0))[0];
    const textTranslateY = useState(() => new Animated.Value(16))[0];
    const containerOpacity = useState(() => new Animated.Value(1))[0];
    const exitStarted = useRef(false);

    useEffect(() => {
        Animated.parallel([
            Animated.timing(heroScale, { toValue: 1, duration: 900, useNativeDriver: true }),
            Animated.timing(textOpacity, { toValue: 1, duration: 400, delay: 200, useNativeDriver: true }),
            Animated.spring(textTranslateY, { toValue: 0, friction: 8, delay: 200, useNativeDriver: true }),
        ]).start();
    }, [heroScale, textOpacity, textTranslateY]);

    useEffect(() => {
        if (!isReady || exitStarted.current) return;
        exitStarted.current = true;
        Animated.timing(containerOpacity, { toValue: 0, duration: 300, delay: 150, useNativeDriver: true }).start(() => onAnimationComplete());
    }, [isReady, containerOpacity, onAnimationComplete]);

    return (
        <Animated.View style={[styles.container, { backgroundColor: T.background, opacity: containerOpacity }]} pointerEvents="auto">
            <Animated.View style={{ transform: [{ scale: heroScale }] }}>
                <StadiumHero fadeTo={T.background} style={{ height: height * 0.62 }} />
            </Animated.View>

            <Animated.View style={[styles.brand, { opacity: textOpacity, transform: [{ translateY: textTranslateY }] }]}>
                <Text style={[styles.appName, { color: T.text }]}>HALISAHA</Text>
                <Text style={[styles.tagline, { color: isDark ? palette.greenBright : palette.greenText }]}>Sahaya çık, farkını göster.</Text>
            </Animated.View>

            <View style={styles.loadingContainer}>
                <LoadingDots color={isDark ? palette.greenBright : palette.green} />
            </View>
        </Animated.View>
    );
}

function LoadingDots({ color }: { color: string }) {
    const dot1 = useState(() => new Animated.Value(0.4))[0];
    const dot2 = useState(() => new Animated.Value(0.4))[0];
    const dot3 = useState(() => new Animated.Value(0.4))[0];

    useEffect(() => {
        const animateDot = (dot: Animated.Value, delay: number) =>
            Animated.loop(
                Animated.sequence([
                    Animated.timing(dot, { toValue: 1, duration: 500, delay, useNativeDriver: true }),
                    Animated.timing(dot, { toValue: 0.4, duration: 500, useNativeDriver: true }),
                ])
            );
        const loops = [animateDot(dot1, 0), animateDot(dot2, 200), animateDot(dot3, 400)];
        loops.forEach(l => l.start());
        return () => loops.forEach(l => l.stop());
    }, [dot1, dot2, dot3]);

    return (
        <View style={styles.dotsRow}>
            {[dot1, dot2, dot3].map((dot, i) => (
                <Animated.View
                    key={i}
                    style={[
                        styles.dot,
                        {
                            backgroundColor: color,
                            opacity: dot,
                            transform: [{ scale: dot.interpolate({ inputRange: [0.4, 1], outputRange: [0.8, 1.2] }) }],
                        },
                    ]}
                />
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        ...StyleSheet.absoluteFill,
        zIndex: 999,
    },
    brand: {
        alignItems: 'center',
        marginTop: 8,
    },
    appName: {
        fontSize: 40,
        fontWeight: '800',
        letterSpacing: 0.5,
    },
    tagline: {
        fontSize: 16,
        fontWeight: '700',
        marginTop: 6,
    },
    loadingContainer: {
        position: 'absolute',
        bottom: 72,
        left: 0,
        right: 0,
        alignItems: 'center',
    },
    dotsRow: {
        flexDirection: 'row',
        gap: 8,
        alignItems: 'center',
    },
    dot: {
        width: 8,
        height: 8,
        borderRadius: 4,
    },
});
