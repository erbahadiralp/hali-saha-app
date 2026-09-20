import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../context/ThemeContext';

interface ToastProps {
    visible: boolean;
    message: string;
    type?: 'info' | 'success' | 'error';
    onPress?: () => void;
    onHide: () => void;
}

export const ToastNotification = ({ visible, message, type = 'info', onPress, onHide }: ToastProps) => {
    const insets = useSafeAreaInsets();
    const { width } = useWindowDimensions();
    const { isDark } = useTheme();
    const translateY = useRef(new Animated.Value(-150)).current;

    useEffect(() => {
        if (visible) {
            Animated.spring(translateY, {
                toValue: insets.top + 10,
                useNativeDriver: true,
            }).start();

            // Auto hide after 4 seconds
            const timer = setTimeout(() => {
                hide();
            }, 4000);

            return () => clearTimeout(timer);
        } else {
            hide();
        }
    }, [visible]);

    const hide = () => {
        Animated.timing(translateY, {
            toValue: -150,
            duration: 300,
            useNativeDriver: true,
        }).start(() => {
            if (visible) onHide();
        });
    };

    const getIcon = () => {
        switch (type) {
            case 'success': return 'check-circle';
            case 'error': return 'error';
            default: return 'notifications-active';
        }
    };

    const getColor = () => {
        switch (type) {
            case 'success': return '#22c55e';
            case 'error': return '#ef4444';
            default: return '#10B981';
        }
    };

    if (!visible) return null;

    return (
        <Animated.View
            style={{
                position: 'absolute',
                top: 0,
                left: 20,
                right: 20,
                zIndex: 9999,
                transform: [{ translateY }],
            }}
        >
            <TouchableOpacity
                activeOpacity={0.9}
                onPress={() => {
                    onPress?.();
                    hide();
                }}
                style={{
                    backgroundColor: isDark ? '#1f2937' : '#ffffff',
                    borderRadius: 16,
                    padding: 16,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 12,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.15,
                    shadowRadius: 10,
                    elevation: 6,
                    borderWidth: 1,
                    borderColor: isDark ? 'rgba(255,255,255,0.1)' : '#e5e7eb'
                }}
            >
                <View
                    style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        backgroundColor: `${getColor()}20`, // 20% opacity
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    <MaterialIcons name={getIcon()} size={24} color={getColor()} />
                </View>

                <View style={{ flex: 1 }}>
                    <Text style={{ color: isDark ? 'white' : '#111827', fontWeight: 'bold', fontSize: 13, marginBottom: 2 }}>
                        {type === 'error' ? 'Hata' : type === 'success' ? 'Başarılı' : 'Yeni Bildirim'}
                    </Text>
                    <Text style={{ color: isDark ? '#d1d5db' : '#4b5563', fontSize: 13 }} numberOfLines={2}>
                        {message}
                    </Text>
                </View>

                <View style={{ width: 4, height: 40, borderRadius: 2, backgroundColor: getColor() }} />
            </TouchableOpacity>
        </Animated.View >
    );
};
