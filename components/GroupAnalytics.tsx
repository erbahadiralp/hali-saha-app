import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { withOpacity } from '../constants/designTokens';
import { useSettingsColors } from './settings/SettingsUI';

interface GroupAnalyticsData {
    totalMatches: number;
    totalGoals: number;
    avgPlayersPerMatch: number;
    avgGoalsPerMatch: number;
    mostActivePlayer: { name: string; matchCount: number } | null;
    topScorer: { name: string; goals: number } | null;
    topAssister: { name: string; assists: number } | null;
    attendanceRate: number; // 0-100
    matchFrequency: string; // e.g., "Haftada 2 mac"
    // New stats
    biggestWin: string | null; // e.g., "7-2"
    cleanSheetCount: number;
    uniquePlayersCount: number;
    drawPercentage: number;
    avgScoreDiff: number;
}

interface GroupAnalyticsProps {
    data: GroupAnalyticsData;
}

/**
 * Group-wide statistics (Captain Pro), shown inline on the group detail "Genel" tab.
 * Top scorer / assister are omitted here because the tab already shows the leader tiles.
 * Colors come only from designTokens.
 */
export function GroupAnalytics({ data }: GroupAnalyticsProps) {
    const C = useSettingsColors();

    const stats: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: string }[] = [
        { icon: 'football-outline', label: 'Toplam Maç', value: String(data.totalMatches), color: C.link },
        { icon: 'flame-outline', label: 'Toplam Gol', value: String(data.totalGoals), color: C.link },
        { icon: 'people-outline', label: 'Ort. Oyuncu', value: data.avgPlayersPerMatch.toFixed(1), color: C.textSecondary },
        { icon: 'locate-outline', label: 'Ort. Gol/Maç', value: data.avgGoalsPerMatch.toFixed(1), color: C.warning },
        { icon: 'person-outline', label: 'Farklı Oyuncu', value: String(data.uniquePlayersCount), color: C.textSecondary },
        { icon: 'shield-checkmark-outline', label: 'Gol Yemeyen', value: String(data.cleanSheetCount), color: C.link },
    ];

    const highlights: { icon: keyof typeof Ionicons.glyphMap; label: string; value: string; color: string }[] = [
        ...(data.mostActivePlayer ? [{ icon: 'medal-outline' as const, label: 'En Aktif Oyuncu', value: `${data.mostActivePlayer.name} · ${data.mostActivePlayer.matchCount} maç`, color: C.gold }] : []),
        { icon: 'repeat-outline', label: 'Maç Sıklığı', value: data.matchFrequency, color: C.link },
        { icon: 'checkmark-done-outline', label: 'Katılım Oranı', value: `%${data.attendanceRate.toFixed(0)}`, color: C.link },
        ...(data.biggestWin ? [{ icon: 'trending-up-outline' as const, label: 'En Farklı Skor', value: data.biggestWin, color: C.error }] : []),
        { icon: 'git-compare-outline', label: 'Beraberlik Oranı', value: `%${data.drawPercentage.toFixed(0)}`, color: C.warning },
        { icon: 'swap-vertical-outline', label: 'Ort. Skor Farkı', value: data.avgScoreDiff.toFixed(1), color: C.textSecondary },
    ];

    return (
        <View style={{ gap: 10 }}>
            <View style={st.grid}>
                {stats.map(s => (
                    <View key={s.label} style={[st.statBox, { backgroundColor: C.card, borderColor: C.border }]}>
                        <Ionicons name={s.icon} size={17} color={s.color} />
                        <Text style={[st.statNum, { color: C.text }]}>{s.value}</Text>
                        <Text style={[st.statLbl, { color: C.textSecondary }]} numberOfLines={1}>{s.label}</Text>
                    </View>
                ))}
            </View>

            <View style={[st.list, { backgroundColor: C.card, borderColor: C.border }]}>
                {highlights.map((h, i) => (
                    <View key={h.label} style={[st.row, { borderBottomColor: C.divider }, i === highlights.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={[st.rowIcon, { backgroundColor: withOpacity(h.color, 0.14) }]}>
                            <Ionicons name={h.icon} size={16} color={h.color} />
                        </View>
                        <Text style={[st.rowLabel, { color: C.textSecondary }]}>{h.label}</Text>
                        <Text style={[st.rowValue, { color: C.text }]} numberOfLines={1}>{h.value}</Text>
                    </View>
                ))}
            </View>
        </View>
    );
}

const st = StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
    statBox: { width: '31%', flexGrow: 1, borderRadius: 16, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 6, alignItems: 'center', gap: 2 },
    statNum: { fontSize: 18, fontWeight: '800', marginTop: 2 },
    statLbl: { fontSize: 10.5, fontWeight: '600' },
    list: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 14 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth },
    rowIcon: { width: 30, height: 30, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    rowLabel: { flex: 1, fontSize: 13, fontWeight: '600' },
    rowValue: { fontSize: 13.5, fontWeight: '800', maxWidth: '55%', textAlign: 'right' },
});

/**
 * Calculate analytics data from matches and members
 */
export function calculateGroupAnalytics(
    matches: any[],
    members: any[]
): GroupAnalyticsData {
    const finishedMatches = matches.filter(m => m.status === 'FINISHED' || m.isFinished);
    const totalMatches = finishedMatches.length;

    let totalGoals = 0;
    let totalPlayers = 0;
    let cleanSheetCount = 0;
    let drawCount = 0;
    let totalScoreDiff = 0;
    let biggestWinDiff = 0;
    let biggestWinScore = '';
    const uniquePlayers = new Set<string>();
    const playerMatchCounts: Record<string, { name: string; count: number }> = {};
    const playerGoals: Record<string, { name: string; goals: number }> = {};
    const playerAssists: Record<string, { name: string; assists: number }> = {};

    finishedMatches.forEach(match => {
        const scoreA = match.scoreA || 0;
        const scoreB = match.scoreB || 0;
        totalGoals += scoreA + scoreB;

        // Score analysis
        const diff = Math.abs(scoreA - scoreB);
        totalScoreDiff += diff;
        if (diff === 0) drawCount++;
        if (scoreA === 0 || scoreB === 0) cleanSheetCount++;
        if (diff > biggestWinDiff) {
            biggestWinDiff = diff;
            biggestWinScore = `${Math.max(scoreA, scoreB)} - ${Math.min(scoreA, scoreB)}`;
        }

        // Count players
        const matchPlayers = match.participants?.filter((p: any) => p.status === 'IN')?.length || 0;
        totalPlayers += matchPlayers;

        // Track player stats from participants
        match.participants?.forEach((p: any) => {
            if (p.status !== 'IN') return;
            const name = p.name || p.displayName || 'Isimsiz';
            const id = p.userId || p.id;
            if (!id) return;

            uniquePlayers.add(id);

            if (!playerMatchCounts[id]) playerMatchCounts[id] = { name, count: 0 };
            playerMatchCounts[id].count++;

            if (p.goals) {
                if (!playerGoals[id]) playerGoals[id] = { name, goals: 0 };
                playerGoals[id].goals += p.goals;
            }
            if (p.assists) {
                if (!playerAssists[id]) playerAssists[id] = { name, assists: 0 };
                playerAssists[id].assists += p.assists;
            }
        });
    });

    // Find top players
    const sortedByMatches = Object.values(playerMatchCounts).sort((a, b) => b.count - a.count);
    const sortedByGoals = Object.values(playerGoals).sort((a, b) => b.goals - a.goals);
    const sortedByAssists = Object.values(playerAssists).sort((a, b) => b.assists - a.assists);

    // Calculate match frequency
    let matchFrequency = 'Veri yetersiz';
    if (finishedMatches.length >= 2) {
        const dates = finishedMatches
            .map(m => m.date instanceof Date ? m.date : new Date(m.date))
            .sort((a, b) => a.getTime() - b.getTime());
        const firstMatch = dates[0];
        const lastMatch = dates[dates.length - 1];
        const daysDiff = Math.max(1, (lastMatch.getTime() - firstMatch.getTime()) / (1000 * 60 * 60 * 24));
        const matchesPerWeek = (totalMatches / daysDiff) * 7;

        if (matchesPerWeek >= 3) matchFrequency = `Haftada ${matchesPerWeek.toFixed(0)} maç`;
        else if (matchesPerWeek >= 1) matchFrequency = `Haftada ${matchesPerWeek.toFixed(1)} maç`;
        else matchFrequency = `Ayda ${(matchesPerWeek * 4).toFixed(1)} maç`;
    }

    // Calculate attendance rate
    const maxPossibleAttendance = totalMatches * members.length;
    const attendanceRate = maxPossibleAttendance > 0 ? (totalPlayers / maxPossibleAttendance) * 100 : 0;

    return {
        totalMatches,
        totalGoals,
        avgPlayersPerMatch: totalMatches > 0 ? totalPlayers / totalMatches : 0,
        avgGoalsPerMatch: totalMatches > 0 ? totalGoals / totalMatches : 0,
        mostActivePlayer: sortedByMatches[0] ? { name: sortedByMatches[0].name, matchCount: sortedByMatches[0].count } : null,
        topScorer: sortedByGoals[0] || null,
        topAssister: sortedByAssists[0] || null,
        attendanceRate: Math.min(100, attendanceRate),
        matchFrequency,
        // New stats
        biggestWin: biggestWinDiff > 0 ? biggestWinScore : null,
        cleanSheetCount,
        uniquePlayersCount: uniquePlayers.size,
        drawPercentage: totalMatches > 0 ? (drawCount / totalMatches) * 100 : 0,
        avgScoreDiff: totalMatches > 0 ? totalScoreDiff / totalMatches : 0,
    };
}
