import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Lightweight network status check without @react-native-community/netinfo.
 * Uses fetch to a known endpoint periodically.
 * Falls back to navigator.onLine on web.
 */
function useNetworkStatus() {
    const [isOnline, setIsOnline] = useState(true);

    useEffect(() => {
        let isMounted = true;

        const checkConnection = async () => {
            try {
                if (Platform.OS === 'web') {
                    if (isMounted) setIsOnline(navigator.onLine);
                    return;
                }
                // Quick HEAD request to Google DNS (lightweight check)
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), 5000);
                await fetch('https://dns.google/resolve?name=google.com&type=A', {
                    method: 'HEAD',
                    signal: controller.signal,
                });
                clearTimeout(timeout);
                if (isMounted) setIsOnline(true);
            } catch {
                if (isMounted) setIsOnline(false);
            }
        };

        // Initial check
        checkConnection();

        // Periodic check every 10 seconds
        const interval = setInterval(checkConnection, 10000);

        // Web-specific listeners
        if (Platform.OS === 'web') {
            const handleOnline = () => setIsOnline(true);
            const handleOffline = () => setIsOnline(false);
            window.addEventListener('online', handleOnline);
            window.addEventListener('offline', handleOffline);
            return () => {
                isMounted = false;
                clearInterval(interval);
                window.removeEventListener('online', handleOnline);
                window.removeEventListener('offline', handleOffline);
            };
        }

        return () => {
            isMounted = false;
            clearInterval(interval);
        };
    }, []);

    return isOnline;
}

export default function NetworkStatusBanner() {
    const isOnline = useNetworkStatus();
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const insets = useSafeAreaInsets();

    const slideAnim = useRef(new Animated.Value(-60)).current;
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (!isOnline) {
            setIsVisible(true);
            Animated.spring(slideAnim, {
                toValue: 0,
                friction: 8,
                useNativeDriver: true,
            }).start();
        } else if (isVisible) {
            // Brief "back online" message then hide
            Animated.timing(slideAnim, {
                toValue: -60,
                duration: 300,
                delay: 1500, // Show "back online" briefly
                useNativeDriver: true,
            }).start(() => setIsVisible(false));
        }
    }, [isOnline]);

    if (!isVisible && isOnline) return null;

    return (
        <Animated.View
            style={[
                styles.banner,
                {
                    transform: [{ translateY: slideAnim }],
                    backgroundColor: isOnline ? '#22C55E' : '#EF4444',
                    paddingTop: insets.top + 4,
                },
            ]}
        >
            <View style={styles.content}>
                <Text style={styles.icon}>{isOnline ? '✅' : '📡'}</Text>
                <Text style={styles.text}>
                    {isOnline ? 'Bağlantı yeniden sağlandı' : 'İnternet bağlantısı yok'}
                </Text>
            </View>
        </Animated.View>
    );
}

const styles = StyleSheet.create({
    banner: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        elevation: 9999,
    },
    content: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 8,
        paddingHorizontal: 16,
        gap: 8,
    },
    icon: {
        fontSize: 14,
    },
    text: {
        color: '#ffffff',
        fontSize: 13,
        fontWeight: '600',
    },
});
