import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import React, { createContext, ReactNode, useContext, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, TouchableWithoutFeedback, useColorScheme, View } from 'react-native';

export interface AlertButton {
    text: string;
    onPress?: () => void;
    style?: 'default' | 'cancel' | 'destructive';
}

interface AlertOptions {
    title: string;
    message?: string;
    buttons?: AlertButton[];
    icon?: keyof typeof Ionicons.glyphMap;
    type?: 'success' | 'error' | 'info' | 'warning';
}

interface AlertContextType {
    alert: (title: string, message?: string, buttons?: AlertButton[], options?: Partial<AlertOptions>) => void;
}

const AlertContext = createContext<AlertContextType | undefined>(undefined);

export const useAlert = () => {
    const context = useContext(AlertContext);
    if (!context) {
        throw new Error('useAlert must be used within an AlertProvider');
    }
    return context;
};

export const AlertProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [isVisible, setIsVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState<AlertOptions | null>(null);

    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const textColor = isDark ? '#FFFFFF' : '#111827';
    const tintColor = '#10B981';

    const alert = (title: string, message?: string, buttons?: AlertButton[], options?: Partial<AlertOptions>) => {
        let defaultButtons: AlertButton[] = [{ text: 'Tamam', onPress: () => closeAlert() }];

        // Match native Alert.alert signature mapping
        if (buttons && buttons.length > 0) {
            defaultButtons = buttons;
        }

        setAlertConfig({
            title,
            message,
            buttons: defaultButtons,
            ...options
        });
        setIsVisible(true);
    };

    const closeAlert = () => {
        setIsVisible(false);
        setTimeout(() => setAlertConfig(null), 300); // Wait for transition
    };

    const handleButtonPress = (button: AlertButton) => {
        closeAlert();
        if (button.onPress) {
            setTimeout(() => button.onPress!(), 300);
        }
    };

    const getTypeColor = (type?: string) => {
        switch (type) {
            case 'success': return '#10B981';
            case 'error': return '#EF4444';
            case 'warning': return '#F59E0B';
            default: return tintColor;
        }
    };

    const getTypeIcon = (type?: string): keyof typeof Ionicons.glyphMap => {
        switch (type) {
            case 'success': return 'checkmark-circle';
            case 'error': return 'close-circle';
            case 'warning': return 'warning';
            default: return 'information-circle';
        }
    };

    return (
        <AlertContext.Provider value={{ alert }}>
            {children}
            <Modal
                transparent
                visible={isVisible}
                animationType="fade"
                onRequestClose={closeAlert}
            >
                <TouchableWithoutFeedback onPress={() => closeAlert()}>
                    <View style={styles.overlay}>
                        <BlurView
                            intensity={isDark ? 50 : 80}
                            tint={isDark ? 'dark' : 'light'}
                            style={StyleSheet.absoluteFill}
                        />
                        <TouchableWithoutFeedback>
                            <View style={[
                                styles.alertBox,
                                { backgroundColor: isDark ? 'rgba(30,30,30,0.85)' : 'rgba(255,255,255,0.95)' }
                            ]}>
                                {alertConfig?.icon || alertConfig?.type ? (
                                    <View style={[
                                        styles.iconContainer,
                                        { backgroundColor: `${getTypeColor(alertConfig?.type)}20` }
                                    ]}>
                                        <Ionicons
                                            name={alertConfig?.icon || getTypeIcon(alertConfig?.type)}
                                            size={32}
                                            color={getTypeColor(alertConfig?.type)}
                                        />
                                    </View>
                                ) : null}

                                <Text style={[styles.title, { color: textColor }]}>
                                    {alertConfig?.title}
                                </Text>

                                {alertConfig?.message && (
                                    <Text style={[styles.message, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                                        {alertConfig.message}
                                    </Text>
                                )}

                                <View style={styles.buttonContainer}>
                                    {alertConfig?.buttons?.map((button, index) => (
                                        <TouchableOpacity
                                            key={index}
                                            style={[
                                                styles.button,
                                                {
                                                    borderLeftWidth: index > 0 ? StyleSheet.hairlineWidth : 0,
                                                    borderLeftColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                                                }
                                            ]}
                                            onPress={() => handleButtonPress(button)}
                                        >
                                            <Text style={[
                                                styles.buttonText,
                                                {
                                                    color: button.style === 'destructive' ? '#EF4444' :
                                                        button.style === 'cancel' ? (isDark ? '#9CA3AF' : '#6B7280') :
                                                            tintColor,
                                                    fontWeight: button.style === 'cancel' ? 'normal' : 'bold'
                                                }
                                            ]}>
                                                {button.text}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        </TouchableWithoutFeedback>
                    </View>
                </TouchableWithoutFeedback>
            </Modal>
        </AlertContext.Provider>
    );
};

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'rgba(0,0,0,0.5)',
    },
    alertBox: {
        width: '85%',
        maxWidth: 340,
        borderRadius: 20,
        alignItems: 'center',
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: 'rgba(255,255,255,0.1)',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
        elevation: 10,
    },
    iconContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        justifyContent: 'center',
        alignItems: 'center',
        marginTop: 24,
        marginBottom: -8,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        textAlign: 'center',
        marginTop: 24,
        paddingHorizontal: 16,
    },
    message: {
        fontSize: 14,
        textAlign: 'center',
        marginTop: 8,
        marginBottom: 24,
        paddingHorizontal: 20,
        lineHeight: 20,
    },
    buttonContainer: {
        flexDirection: 'row',
        borderTopWidth: StyleSheet.hairlineWidth,
        borderTopColor: 'rgba(150,150,150,0.2)',
        width: '100%',
    },
    button: {
        flex: 1,
        paddingVertical: 16,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'transparent',
    },
    buttonText: {
        fontSize: 16,
    },
});
