import React, { useEffect, useState } from 'react';
import { Modal, StyleSheet, Text, TouchableOpacity, View, Animated, Dimensions } from 'react-native';
import { BlurView } from 'expo-blur';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { collection, query, where, getDocs, limit, doc, getDoc } from 'firebase/firestore';
import { MaterialIcons } from '@expo/vector-icons';
import { db } from '../firebaseConfig';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { hasUserCompletedVoting } from '../services/mvp';

interface PendingMatch {
    matchId: string;
    venue: string;
    date: Date;
}

export default function MvpReminderSheet() {
    const { user } = useAuth();
    const { isDark } = useTheme();
    const router = useRouter();
    const [visible, setVisible] = useState(false);
    const [pendingMatch, setPendingMatch] = useState<PendingMatch | null>(null);
    const [slideAnim] = useState(new Animated.Value(Dimensions.get('window').height));

    const colors = {
        background: isDark ? 'rgba(15, 18, 16, 0.85)' : 'rgba(255, 255, 255, 0.9)',
        text: isDark ? '#FFFFFF' : '#111827',
        textSecondary: isDark ? '#A0A0A0' : '#6B7280',
        primary: '#10B981',
        border: isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)',
        cardBackground: isDark ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 0, 0, 0.03)',
    };

    useEffect(() => {
        if (!user) {
            setVisible(false);
            setPendingMatch(null);
            return;
        }

        const checkPendingMvpVoting = async () => {
            try {
                // Query user's participant documents (limit 10 for recent matches)
                const q = query(
                    collection(db, 'match_participants'),
                    where('userId', '==', user.uid),
                    where('status', '==', 'IN'),
                    limit(10)
                );
                const snap = await getDocs(q);
                if (snap.empty) return;

                const matchesToCheck: PendingMatch[] = [];
                for (const pDoc of snap.docs) {
                    const pData = pDoc.data();
                    const mId = pData.matchId;
                    if (!mId) continue;

                    const matchSnap = await getDoc(doc(db, 'matches', mId));
                    if (matchSnap.exists()) {
                        const matchData = matchSnap.data();
                        if (matchData.status === 'FINISHED') {
                            matchesToCheck.push({
                                matchId: mId,
                                venue: matchData.venue || matchData.name || 'Halı Saha Maçı',
                                date: matchData.date?.toDate ? matchData.date.toDate() : new Date(matchData.date)
                            });
                        }
                    }
                }

                // Sort matches by date descending (most recent first)
                matchesToCheck.sort((a, b) => b.date.getTime() - a.date.getTime());

                // Find the first finished match with an active MVP session the user hasn't voted in
                for (const match of matchesToCheck) {
                    const sessionSnap = await getDoc(doc(db, 'mvp_sessions', match.matchId));
                    if (sessionSnap.exists()) {
                        const sessionData = sessionSnap.data();
                        if (sessionData.isComplete === false) {
                            const voted = await hasUserCompletedVoting(match.matchId, user.uid);
                            if (!voted) {
                                const promptKey = `lastMvpPromptShown_${match.matchId}`;
                                const lastShown = await AsyncStorage.getItem(promptKey);
                                if (!lastShown) {
                                    setPendingMatch(match);
                                    setVisible(true);
                                    break;
                                }
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('Error checking pending MVP voting:', err);
            }
        };

        checkPendingMvpVoting();
    }, [user]);

    useEffect(() => {
        if (visible) {
            Animated.spring(slideAnim, {
                toValue: 0,
                useNativeDriver: true,
                tension: 50,
                friction: 8,
            }).start();
        } else {
            Animated.timing(slideAnim, {
                toValue: Dimensions.get('window').height,
                duration: 250,
                useNativeDriver: true,
            }).start();
        }
    }, [visible]);

    const handleVoteNow = () => {
        if (!pendingMatch) return;
        const matchId = pendingMatch.matchId;
        setVisible(false);
        // Navigate to the match voting screen
        router.push(`/match/${matchId}/mvp-vote`);
    };

    const handleDismiss = async () => {
        if (!pendingMatch) return;
        try {
            // Store that we prompted the user for this match to prevent duplicates
            const promptKey = `lastMvpPromptShown_${pendingMatch.matchId}`;
            await AsyncStorage.setItem(promptKey, new Date().toISOString());
        } catch (err) {
            console.error('Error saving prompt state:', err);
        }
        setVisible(false);
    };

    if (!visible || !pendingMatch) return null;

    return (
        <Modal
            transparent
            visible={visible}
            animationType="fade"
            onRequestClose={handleDismiss}
        >
            <View style={styles.overlay}>
                <TouchableOpacity
                    style={StyleSheet.absoluteFill}
                    activeOpacity={1}
                    onPress={handleDismiss}
                />
                
                <Animated.View
                    style={[
                        styles.sheetContainer,
                        {
                            transform: [{ translateY: slideAnim }],
                            backgroundColor: colors.background,
                            borderColor: colors.border,
                        },
                    ]}
                >
                    <BlurView
                        intensity={isDark ? 65 : 85}
                        tint={isDark ? 'dark' : 'light'}
                        style={StyleSheet.absoluteFill}
                    />
                    
                    <View style={styles.content}>
                        {/* Drag Handle Indicator */}
                        <View style={[styles.dragHandle, { backgroundColor: colors.border }]} />

                        {/* Title and Icon */}
                        <View style={styles.header}>
                            <View style={styles.iconWrapper}>
                                <MaterialIcons name="emoji-events" size={28} color="#EAB308" />
                            </View>
                            <Text style={[styles.title, { color: colors.text }]}>
                                Son Maçının MVP'si Kim? 🏆
                            </Text>
                            <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
                                Oylama devam ediyor! Maçın en değerli oyuncusunu belirlemek için oyunu kullan.
                            </Text>
                        </View>

                        {/* Match Details Card */}
                        <View style={[styles.matchCard, { backgroundColor: colors.cardBackground, borderColor: colors.border }]}>
                            <MaterialIcons name="sports-soccer" size={20} color={colors.primary} />
                            <View style={styles.matchInfo}>
                                <Text style={[styles.matchVenue, { color: colors.text }]} numberOfLines={1}>
                                    {pendingMatch.venue}
                                </Text>
                                <Text style={[styles.matchDate, { color: colors.textSecondary }]}>
                                    {pendingMatch.date.toLocaleDateString('tr-TR', {
                                        day: 'numeric',
                                        month: 'long',
                                        weekday: 'short',
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    })}
                                </Text>
                            </View>
                        </View>

                        {/* Actions */}
                        <View style={styles.actions}>
                            <TouchableOpacity
                                style={[styles.buttonPrimary, { backgroundColor: colors.primary }]}
                                onPress={handleVoteNow}
                            >
                                <Text style={styles.buttonPrimaryText}>Şimdi Oy Ver 🗳️</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                style={styles.buttonSecondary}
                                onPress={handleDismiss}
                            >
                                <Text style={[styles.buttonSecondaryText, { color: colors.textSecondary }]}>
                                    Daha Sonra
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </Animated.View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.4)',
        justifyContent: 'flex-end',
    },
    sheetContainer: {
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        borderWidth: 1,
        borderBottomWidth: 0,
        overflow: 'hidden',
        paddingBottom: 40,
    },
    content: {
        padding: 24,
        alignItems: 'center',
    },
    dragHandle: {
        width: 40,
        height: 5,
        borderRadius: 2.5,
        marginBottom: 20,
    },
    header: {
        alignItems: 'center',
        marginBottom: 20,
    },
    iconWrapper: {
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: 'rgba(234, 179, 8, 0.12)',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
        borderWidth: 1,
        borderColor: 'rgba(234, 179, 8, 0.3)',
    },
    title: {
        fontSize: 20,
        fontWeight: '800',
        textAlign: 'center',
        marginBottom: 8,
    },
    subtitle: {
        fontSize: 14,
        textAlign: 'center',
        lineHeight: 20,
        paddingHorizontal: 12,
    },
    matchCard: {
        flexDirection: 'row',
        alignItems: 'center',
        padding: 16,
        borderRadius: 16,
        borderWidth: 1,
        width: '100%',
        marginBottom: 24,
        gap: 12,
    },
    matchInfo: {
        flex: 1,
    },
    matchVenue: {
        fontSize: 15,
        fontWeight: '700',
    },
    matchDate: {
        fontSize: 12,
        marginTop: 2,
    },
    actions: {
        width: '100%',
        gap: 12,
    },
    buttonPrimary: {
        height: 52,
        borderRadius: 14,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        shadowColor: '#10B981',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
        elevation: 2,
    },
    buttonPrimaryText: {
        color: '#FFFFFF',
        fontSize: 16,
        fontWeight: '700',
    },
    buttonSecondary: {
        height: 48,
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
    },
    buttonSecondaryText: {
        fontSize: 15,
        fontWeight: '600',
    },
});
