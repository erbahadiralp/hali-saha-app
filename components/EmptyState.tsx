import { MaterialIcons } from '@expo/vector-icons';
import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View, useColorScheme } from 'react-native';

type EmptyStateType = 'matches' | 'groups' | 'players' | 'notifications' | 'search' | 'generic';

interface EmptyStateProps {
    type: EmptyStateType;
    title?: string;
    message?: string;
    actionLabel?: string;
    onAction?: () => void;
}

const emptyStateConfig: Record<EmptyStateType, {
    icon: keyof typeof MaterialIcons.glyphMap;
    color: string;
    defaultTitle: string;
    defaultMessage: string;
}> = {
    matches: {
        icon: 'sports-soccer',
        color: '#10B981',
        defaultTitle: 'Henüz Maç Yok',
        defaultMessage: 'Yaklaşan veya geçmiş maçınız bulunmuyor. Yeni bir maç oluşturun veya bir gruba katılın.',
    },
    groups: {
        icon: 'groups',
        color: '#3B82F6',
        defaultTitle: 'Henüz Grup Yok',
        defaultMessage: 'Henüz bir gruba üye değilsiniz. Yeni bir grup oluşturun veya mevcut bir gruba katılın.',
    },
    players: {
        icon: 'person-search',
        color: '#A855F7',
        defaultTitle: 'Oyuncu Bulunamadı',
        defaultMessage: 'Arama kriterlerinize uygun oyuncu bulunamadı.',
    },
    notifications: {
        icon: 'notifications-none',
        color: '#F59E0B',
        defaultTitle: 'Bildirim Yok',
        defaultMessage: 'Henüz bildiriminiz bulunmuyor. Maçlara katılın ve arkadaşlarınızı takip edin.',
    },
    search: {
        icon: 'search-off',
        color: '#9CA3AF',
        defaultTitle: 'Sonuç Bulunamadı',
        defaultMessage: 'Aramanızla eşleşen sonuç bulunamadı. Farklı anahtar kelimeler deneyin.',
    },
    generic: {
        icon: 'inbox',
        color: '#6B7280',
        defaultTitle: 'Burada Bir Şey Yok',
        defaultMessage: 'Henüz gösterilecek içerik bulunmuyor.',
    },
};

export default function EmptyState({
    type,
    title,
    message,
    actionLabel,
    onAction,
}: EmptyStateProps) {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';
    const config = emptyStateConfig[type];

    return (
        <View style={styles.container}>
            <View style={[styles.iconContainer, { backgroundColor: config.color + '20' }]}>
                <MaterialIcons name={config.icon} size={48} color={config.color} />
            </View>
            <Text style={[styles.title, { color: isDark ? 'white' : '#1F2937' }]}>
                {title || config.defaultTitle}
            </Text>
            <Text style={[styles.message, { color: isDark ? '#9CA3AF' : '#6B7280' }]}>
                {message || config.defaultMessage}
            </Text>
            {actionLabel && onAction && (
                <TouchableOpacity
                    style={[styles.actionButton, { backgroundColor: config.color }]}
                    onPress={onAction}
                >
                    <Text style={styles.actionButtonText}>{actionLabel}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        padding: 32,
        minHeight: 300,
    },
    iconContainer: {
        width: 96,
        height: 96,
        borderRadius: 48,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
    },
    title: {
        fontSize: 20,
        fontWeight: 'bold',
        textAlign: 'center',
        marginBottom: 8,
    },
    message: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 22,
        marginBottom: 24,
    },
    actionButton: {
        paddingHorizontal: 24,
        paddingVertical: 12,
        borderRadius: 24,
    },
    actionButtonText: {
        color: '#0a0a0a',
        fontSize: 15,
        fontWeight: '600',
    },
});
