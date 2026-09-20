import { MaterialIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getUserMatches, getUserProfile } from '../../../services/firestore';

// Same color palette as profile.tsx for consistency
const COLORS = {
    primary: '#10B981',
    background: '#000000',
    card: '#0d1f0d',
    cardBorder: '#1a3a1a',
    surface: '#111811',
    surfaceBorder: '#1a3a1a',
    text: '#ffffff',
    textSecondary: '#8a9a88',
    danger: '#ef4444',
};

export default function UserMatchesScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const colorScheme = useColorScheme();
    const [profile, setProfile] = useState<any>(null);
    const [matches, setMatches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadData = async () => {
            if (!id) return;
            try {
                // Fetch profile for name
                const profileData = await getUserProfile(id as string);
                setProfile(profileData);

                // Fetch matches
                const matchesData = await getUserMatches(id as string);
                matchesData.sort((a, b) => {
                    const dateA = a.date instanceof Date ? a.date : new Date(a.date);
                    const dateB = b.date instanceof Date ? b.date : new Date(b.date);
                    return dateB.getTime() - dateA.getTime();
                });
                setMatches(matchesData);
            } catch (error) {
                console.error(error);
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [id]);

    if (loading) {
        return (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.background }}>
                <ActivityIndicator size="large" color={COLORS.primary} />
            </View>
        );
    }

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: COLORS.background }}>
            {/* Header */}
            <View style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 16,
                paddingVertical: 12,
                borderBottomWidth: 1,
                borderBottomColor: COLORS.surfaceBorder,
                gap: 16
            }}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={{
                        width: 40,
                        height: 40,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 20,
                        backgroundColor: 'rgba(255,255,255,0.08)',
                        borderWidth: 1,
                        borderColor: 'rgba(255,255,255,0.1)',
                    }}
                >
                    <MaterialIcons name="arrow-back" size={22} color={COLORS.text} />
                </TouchableOpacity>

                <View>
                    <Text style={{ color: COLORS.text, fontSize: 18, fontWeight: '800', letterSpacing: 0.5 }}>
                        MAÇ GEÇMİŞİ
                    </Text>
                    <Text style={{ color: COLORS.textSecondary, fontSize: 13, fontWeight: '600' }}>
                        {profile?.displayName || 'Oyuncu'}
                    </Text>
                </View>
            </View>

            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={{ padding: 16 }}
            >
                {matches.length > 0 ? (
                    matches.map((match) => {
                        const matchDate = match.date instanceof Date ? match.date : new Date(match.date);
                        const userTeam = match.teamA?.some((p: any) => p.odaylarId === id || p.odaylarId === profile?.odaylarId) ? 'A' : 'B';
                        const scoreA = match.scoreA || 0;
                        const scoreB = match.scoreB || 0;
                        const userWon = (userTeam === 'A' && scoreA > scoreB) || (userTeam === 'B' && scoreB > scoreA);
                        const isDraw = scoreA === scoreB;

                        return (
                            <TouchableOpacity
                                key={match.id}
                                onPress={() => router.push(`/match/${match.id}`)}
                                style={{
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    paddingVertical: 12,
                                    paddingHorizontal: 12,
                                    backgroundColor: COLORS.surface,
                                    borderWidth: 1,
                                    borderColor: COLORS.surfaceBorder,
                                    borderRadius: 12,
                                    marginBottom: 8,
                                }}
                            >
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                                    <View style={{
                                        width: 40,
                                        height: 40,
                                        borderRadius: 20,
                                        backgroundColor: COLORS.primary + '12',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                    }}>
                                        <MaterialIcons name="sports-soccer" size={18} color={COLORS.primary} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Text style={{ color: COLORS.text, fontWeight: '700', fontSize: 14 }} numberOfLines={1}>
                                                {match.venue}
                                            </Text>
                                            {match.isFinished && (
                                                <Text style={{ color: COLORS.textSecondary, fontSize: 12, fontWeight: '700' }}>
                                                    {scoreA} - {scoreB}
                                                </Text>
                                            )}
                                        </View>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                            <Text style={{ color: COLORS.textSecondary, fontSize: 11 }}>
                                                {format(matchDate, 'dd MMM yyyy', { locale: tr })}
                                            </Text>
                                            {match.isFinished && (
                                                <Text style={{
                                                    color: isDraw ? COLORS.textSecondary : (userWon ? COLORS.primary : COLORS.danger),
                                                    fontSize: 11,
                                                    fontWeight: '700',
                                                }}>
                                                    {isDraw ? 'Berabere' : (userWon ? 'Kazandı' : 'Kaybetti')}
                                                </Text>
                                            )}
                                        </View>
                                    </View>
                                </View>
                                <MaterialIcons name="chevron-right" size={20} color={COLORS.textSecondary} />
                            </TouchableOpacity>
                        );
                    })
                ) : (
                    <View style={{ alignItems: 'center', paddingVertical: 40 }}>
                        <MaterialIcons name="history-toggle-off" size={48} color={COLORS.cardBorder} />
                        <Text style={{ color: COLORS.textSecondary, fontSize: 14, marginTop: 12 }}>
                            Henüz maç kaydı yok.
                        </Text>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
