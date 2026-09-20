import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { collection, doc, getDocs, limit, orderBy, query, updateDoc, where } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAlert } from '../../components/CustomAlertProvider';
import { useTheme } from '../../context/ThemeContext';
import { db } from '../../firebaseConfig';

export default function ManualStatsScreen() {
    const router = useRouter();
    const { isDark } = useTheme();
    const { alert } = useAlert();

    const [loadingMatches, setLoadingMatches] = useState(true);
    const [matches, setMatches] = useState<any[]>([]);
    const [selectedMatch, setSelectedMatch] = useState<any | null>(null);

    const [loadingPlayers, setLoadingPlayers] = useState(false);
    const [players, setPlayers] = useState<any[]>([]);
    const [selectedPlayer, setSelectedPlayer] = useState<any | null>(null);

    const [stats, setStats] = useState({
        goals: '0',
        assists: '0',
        saves: '0',
        yellowCards: '0',
        redCards: '0',
        ownGoals: '0'
    });

    const [saving, setSaving] = useState(false);

    useEffect(() => {
        loadRecentFinishedMatches();
    }, []);

    const loadRecentFinishedMatches = async () => {
        try {
            const q = query(
                collection(db, 'matches'),
                where('status', '==', 'FINISHED'),
                orderBy('date', 'desc'),
                limit(10)
            );
            const snapshot = await getDocs(q);
            const loadedMatches = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() } as any))
                .filter(m => !m.isDeleted);
            setMatches(loadedMatches);
        } catch (error) {
            console.error('Error loading matches:', error);
            alert('Hata', 'Maçlar yüklenirken bir hata oluştu');
        } finally {
            setLoadingMatches(false);
        }
    };

    const loadMatchPlayers = async (matchId: string) => {
        setLoadingPlayers(true);
        setSelectedPlayer(null);
        try {
            const q = query(collection(db, 'match_participants'), where('matchId', '==', matchId), where('status', '==', 'IN'));
            const snapshot = await getDocs(q);
            const loadedPlayers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPlayers(loadedPlayers);
        } catch (error) {
            console.error('Error loading players:', error);
            alert('Hata', 'Oyuncular yüklenirken bir hata oluştu');
        } finally {
            setLoadingPlayers(false);
        }
    };

    const handleSelectMatch = (match: any) => {
        setSelectedMatch(match);
        loadMatchPlayers(match.id);
    };

    const handleSelectPlayer = (player: any) => {
        setSelectedPlayer(player);
        setStats({
            goals: (player.goals || 0).toString(),
            assists: (player.assists || 0).toString(),
            saves: (player.saves || 0).toString(),
            yellowCards: (player.yellowCards || 0).toString(),
            redCards: (player.redCards || 0).toString(),
            ownGoals: (player.ownGoals || 0).toString(),
        });
    };

    const handleSaveStats = async () => {
        if (!selectedMatch || !selectedPlayer) return;

        setSaving(true);
        try {
            const newGoals = parseInt(stats.goals) || 0;
            const newAssists = parseInt(stats.assists) || 0;
            const newSaves = parseInt(stats.saves) || 0;
            const newYellow = parseInt(stats.yellowCards) || 0;
            const newRed = parseInt(stats.redCards) || 0;
            const newOwnGoals = parseInt(stats.ownGoals) || 0;

            // Only the participant entry changes; the server rebuilds the player's profile totals from it.
            const pDocRef = doc(db, 'match_participants', selectedPlayer.id);
            await updateDoc(pDocRef, {
                goals: newGoals,
                assists: newAssists,
                saves: newSaves,
                yellowCards: newYellow,
                redCards: newRed,
                ownGoals: newOwnGoals,
                statsEntered: true
            });

            alert('Başarılı', `${selectedPlayer.name || 'Oyuncu'} için istatistikler güncellendi.`);
            loadMatchPlayers(selectedMatch.id); // Refresh
        } catch (error) {
            console.error('Error saving stats:', error);
            alert('Hata', 'İstatistik kaydedilemedi.');
        } finally {
            setSaving(false);
        }
    };

    const inputClasses = `border p-3 rounded-lg mb-4 flex-1 text-center font-bold text-lg ${isDark ? 'border-gray-700 text-white bg-gray-800' : 'border-gray-200 text-gray-900 bg-white'}`;

    return (
        <SafeAreaView style={{ flex: 1, backgroundColor: isDark ? '#000' : '#f5f5f5' }}>
            <View className="flex-row items-center p-4 border-b border-gray-200 dark:border-gray-800">
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
                    <MaterialIcons name="arrow-back" size={22} color={isDark ? '#fff' : '#000'} />
                </TouchableOpacity>
                <Text className={`text-xl font-bold ml-4 ${isDark ? 'text-white' : 'text-gray-900'}`}>
                    Manuel İstatistik Girişi
                </Text>
            </View>

            <ScrollView className="flex-1 p-4">
                {/* 1. SELECT MATCH */}
                <Text className={`font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>1. Son Maçlardan Seçin</Text>
                {loadingMatches ? (
                    <ActivityIndicator color="#10B981" />
                ) : (
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mb-6">
                        {matches.map(m => (
                            <TouchableOpacity
                                key={m.id}
                                onPress={() => handleSelectMatch(m)}
                                className={`p-4 rounded-xl mr-3 border ${selectedMatch?.id === m.id ? 'border-primary bg-primary/20' : isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
                            >
                                <Text className={`font-bold ${isDark ? 'text-white' : 'text-gray-900'}`}>{m.name || 'Maç'}</Text>
                                <Text className={`text-sm ${isDark ? 'text-gray-400' : 'text-gray-500'}`}>{m.venue}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}

                {/* 2. SELECT PLAYER */}
                {selectedMatch && (
                    <>
                        <Text className={`font-bold mb-2 ${isDark ? 'text-white' : 'text-gray-900'}`}>2. Oyuncu Seçin</Text>
                        {loadingPlayers ? (
                            <ActivityIndicator color="#10B981" />
                        ) : (
                            <View className="flex-row flex-wrap gap-2 mb-6">
                                {players.map(p => (
                                    <TouchableOpacity
                                        key={p.id}
                                        onPress={() => handleSelectPlayer(p)}
                                        className={`px-4 py-2 rounded-full border ${selectedPlayer?.id === p.id ? 'border-primary bg-primary/20' : isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-gray-200'}`}
                                    >
                                        <Text className={isDark ? 'text-white' : 'text-gray-900'}>{p.name || 'Bilinmiyor'}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        )}
                    </>
                )}

                {/* 3. ENTER STATS */}
                {selectedPlayer && (
                    <View className={`p-4 rounded-xl mb-8 ${isDark ? 'bg-gray-900' : 'bg-white'}`}>
                        <Text className={`font-bold mb-4 text-center text-lg ${isDark ? 'text-white' : 'text-gray-900'}`}>
                            {selectedPlayer.name} İstatistikleri
                        </Text>

                        <View className="flex-row gap-4">
                            <View className="flex-1">
                                <Text className={`text-center mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Gol</Text>
                                <TextInput
                                    className={inputClasses}
                                    keyboardType="numeric"
                                    value={stats.goals}
                                    onChangeText={t => setStats({ ...stats, goals: t })}
                                />
                            </View>
                            <View className="flex-1">
                                <Text className={`text-center mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Asist</Text>
                                <TextInput
                                    className={inputClasses}
                                    keyboardType="numeric"
                                    value={stats.assists}
                                    onChangeText={t => setStats({ ...stats, assists: t })}
                                />
                            </View>
                            <View className="flex-1">
                                <Text className={`text-center mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Kurtarış</Text>
                                <TextInput
                                    className={inputClasses}
                                    keyboardType="numeric"
                                    value={stats.saves}
                                    onChangeText={t => setStats({ ...stats, saves: t })}
                                />
                            </View>
                        </View>

                        <View className="flex-row gap-4 mb-4">
                            <View className="flex-1">
                                <Text className={`text-center mb-1 text-yellow-500`}>Sarı K.</Text>
                                <TextInput
                                    className={inputClasses}
                                    keyboardType="numeric"
                                    value={stats.yellowCards}
                                    onChangeText={t => setStats({ ...stats, yellowCards: t })}
                                />
                            </View>
                            <View className="flex-1">
                                <Text className={`text-center mb-1 text-red-500`}>Kırmızı K.</Text>
                                <TextInput
                                    className={inputClasses}
                                    keyboardType="numeric"
                                    value={stats.redCards}
                                    onChangeText={t => setStats({ ...stats, redCards: t })}
                                />
                            </View>
                            <View className="flex-1">
                                <Text className={`text-center mb-1 ${isDark ? 'text-gray-400' : 'text-gray-600'}`}>Kendi K.</Text>
                                <TextInput
                                    className={inputClasses}
                                    keyboardType="numeric"
                                    value={stats.ownGoals}
                                    onChangeText={t => setStats({ ...stats, ownGoals: t })}
                                />
                            </View>
                        </View>

                        <TouchableOpacity
                            onPress={handleSaveStats}
                            disabled={saving}
                            className="bg-primary p-4 rounded-xl items-center"
                        >
                            {saving ? (
                                <ActivityIndicator color="#000" />
                            ) : (
                                <Text className="text-black font-bold text-lg">Kaydet</Text>
                            )}
                        </TouchableOpacity>
                    </View>
                )}
            </ScrollView>
        </SafeAreaView>
    );
}
