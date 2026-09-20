import { MaterialIcons } from '@expo/vector-icons';
import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, RefreshControl, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../../context/ThemeContext';
import { getGroupMatches } from '../../../services/firestore';

export default function PastMatchesScreen() {
    const { id } = useLocalSearchParams();
    const router = useRouter();
    const { isDark } = useTheme();
    const insets = useSafeAreaInsets();
    const [matches, setMatches] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    useEffect(() => {
        loadMatches();
    }, [id]);

    const loadMatches = async (isRefresh = false) => {
        if (!id) return;
        if (!isRefresh) setLoading(true);
        try {
            const data = await getGroupMatches(id as string);
            // Filter past matches and sort by date descending
            const pastMatches = data
                .filter((m: any) => {
                    const matchDate = m.date instanceof Date ? m.date : new Date(m.date);
                    return new Date() > matchDate;
                })
                .sort((a: any, b: any) => {
                    const dateA = a.date instanceof Date ? a.date : new Date(a.date);
                    const dateB = b.date instanceof Date ? b.date : new Date(b.date);
                    return dateB.getTime() - dateA.getTime();
                });
            setMatches(pastMatches);
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    const handleRefresh = () => {
        setRefreshing(true);
        loadMatches(true);
    };

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#0E0F0E' : '#F6F7F6' }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: isDark ? 'rgba(255,255,255,0.05)' : '#e5e7eb' }}>
                <TouchableOpacity
                    onPress={() => router.back()}
                    style={{
                        width: 40,
                        height: 40,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 20,
                        backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)',
                        borderWidth: 1,
                        borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)',
                    }}
                >
                    <MaterialIcons name="arrow-back" size={22} color={isDark ? 'white' : 'black'} />
                </TouchableOpacity>
                <Text style={{ flex: 1, textAlign: 'center', fontSize: 18, fontWeight: 'bold', color: isDark ? 'white' : '#111827' }}>
                    Geçmiş Maçlar
                </Text>
                <View style={{ width: 40 }} />
            </View>

            {loading ? (
                <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                    <ActivityIndicator size="large" color="#10B981" />
                </View>
            ) : (
                <FlatList
                    data={matches}
                    keyExtractor={(item) => item.id}
                    contentContainerStyle={{ padding: 16, gap: 12 }}
                    refreshControl={
                        <RefreshControl
                            refreshing={refreshing}
                            onRefresh={handleRefresh}
                            tintColor="#10B981"
                            colors={['#10B981']}
                        />
                    }
                    ListEmptyComponent={
                        <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 48 }}>
                            <MaterialIcons name="history" size={48} color={isDark ? '#6b7280' : '#9ca3af'} />
                            <Text style={{ color: isDark ? '#6b7280' : '#9ca3af', marginTop: 12, fontWeight: '500' }}>
                                Henüz geçmiş maç yok
                            </Text>
                        </View>
                    }
                    renderItem={({ item }) => {
                        const matchDate = item.date instanceof Date ? item.date : new Date(item.date);
                        const isFinished = item.status === 'FINISHED';
                        return (
                            <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => router.push(`/match/${item.id}`)}
                                style={{
                                    backgroundColor: isDark ? '#161817' : 'white',
                                    padding: 16,
                                    borderRadius: 16,
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    gap: 12
                                }}
                            >
                                <View style={{
                                    width: 48,
                                    height: 48,
                                    borderRadius: 12,
                                    backgroundColor: isFinished ? 'rgba(16, 185, 129, 0.05)' : (isDark ? 'rgba(255,255,255,0.05)' : '#e5e7eb'),
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    <MaterialIcons
                                        name={isFinished ? "check-circle" : "sports-soccer"}
                                        size={24}
                                        color={isFinished ? '#10B981' : (isDark ? '#6b7280' : '#9ca3af')}
                                    />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: isDark ? 'white' : '#111827', fontWeight: 'bold', fontSize: 15 }}>
                                        {item.venue}
                                    </Text>
                                    <Text style={{ color: isDark ? '#9ca3af' : '#6b7280', fontSize: 13, marginTop: 2 }}>
                                        {format(matchDate, 'dd MMMM yyyy, EEEE', { locale: tr })}
                                    </Text>
                                    {isFinished && item.scoreA !== undefined && item.scoreB !== undefined && (
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4 }}>
                                            <Text style={{ color: '#10B981', fontWeight: 'bold', fontSize: 14 }}>
                                                {item.scoreA} - {item.scoreB}
                                            </Text>
                                        </View>
                                    )}
                                </View>
                                <MaterialIcons name="chevron-right" size={24} color={isDark ? '#6b7280' : '#9ca3af'} />
                            </TouchableOpacity>
                        );
                    }}
                />
            )}
        </SafeAreaView>
    );
}
