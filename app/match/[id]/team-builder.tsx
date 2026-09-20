import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Image, ScrollView, Share, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';
import { useAlert } from '../../../components/CustomAlertProvider';
import { Avatar, Eyebrow, PrimaryButton, Sheet, SheetRow, compactName } from '../../../components/group/GroupUI';
import { FormationPitch } from '../../../components/match/MatchUI';
import { SettingsScreen, useSettingsColors } from '../../../components/settings/SettingsUI';
import { palette, withOpacity } from '../../../constants/designTokens';
import { usePremium } from '../../../context/PremiumContext';
import { getMatchDetails, getMatchParticipants, getUserProfile } from '../../../services/firestore';
import { getGroupPlayerRating } from '../../../services/groupService';
import { Archetype } from '../../../services/overall';
import { matchRating, resolveOverall } from '../../../services/playerStats';
import { balanceTeams, PlayerForBalancing, Position, randomTeams } from '../../../services/teamBalancer';

/** Layout: design/tasarım/macvar-screens-2.html (Kadro Kurucu); colors from designTokens. */

type Mode = 'random' | 'smart' | 'manual';
type Side = 'A' | 'B' | 'Pool';

const mapPosition = (pos: string): Position => {
    const upper = (pos || '').toUpperCase();
    if (upper.includes('GK') || upper.includes('KAL')) return 'GK';
    if (upper.includes('DF') || upper.includes('DEF') || upper.includes('STOP')) return 'DF';
    if (upper.includes('FW') || upper.includes('FOR') || upper.includes('GOL')) return 'FW';
    return 'MF';
};

const average = (list: any[]) => Math.round(list.reduce((sum, p) => sum + (p.rating || 0), 0) / (list.length || 1));

export default function TeamBuilderScreen() {
    const { alert } = useAlert();
    const { id } = useLocalSearchParams<{ id: string }>();
    const router = useRouter();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();
    const { width: screenW } = useWindowDimensions();
    const { canBalanceTeams } = usePremium();
    const viewShotRef = useRef<ViewShotRef>(null);

    const [match, setMatch] = useState<any>(null);
    const [teamA, setTeamA] = useState<any[]>([]);
    const [teamB, setTeamB] = useState<any[]>([]);
    const [pool, setPool] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [mode, setMode] = useState<Mode>('manual');
    const [selected, setSelected] = useState<{ player: any; side: Side } | null>(null);
    const [showShare, setShowShare] = useState(false);

    const loadData = async () => {
        try {
            const matchData: any = await getMatchDetails(id);
            setMatch(matchData);
            const parts: any[] = await getMatchParticipants(id);
            const withRatings = await Promise.all(parts.map(async p => {
                const profile: any = p.userId?.startsWith('guest_') ? null : await getUserProfile(p.userId).catch(() => null);
                let rating = profile ? resolveOverall(profile) : 50;
                if (matchData?.groupId && profile) {
                    const groupRating = await getGroupPlayerRating(matchData.groupId, p.userId).catch(() => null);
                    rating = matchRating(profile, groupRating?.rating);
                }
                return { ...p, rating, position: profile?.position || 'MID', photoURL: profile?.photoURL || null };
            }));

            const a = withRatings.filter(p => p.team === 'A');
            const b = withRatings.filter(p => p.team === 'B');
            // Players that are in but have no team yet (e.g. promoted from the waitlist) fill the smaller side.
            withRatings.filter(p => p.status === 'IN' && p.team !== 'A' && p.team !== 'B')
                .forEach(p => (a.length <= b.length ? a.push({ ...p, team: 'A' }) : b.push({ ...p, team: 'B' })));
            setTeamA(a);
            setTeamB(b);
            setPool(withRatings.filter(p => p.status !== 'IN' && p.team !== 'A' && p.team !== 'B'));
        } catch (error) {
            console.error(error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (id) loadData();
    }, [id]);

    const runBalancing = (smart: boolean) => {
        const limit = match?.maxPlayers || 14;
        let active = [...teamA, ...teamB];
        let reserve = [...pool];
        if (active.length < limit) {
            reserve.sort((x, y) => y.rating - x.rating);
            const needed = limit - active.length;
            active = [...active, ...reserve.slice(0, needed)];
            reserve = reserve.slice(needed);
        } else if (active.length > limit) {
            active.sort((x, y) => x.rating - y.rating);
            const excess = active.length - limit;
            reserve = [...reserve, ...active.slice(0, excess)];
            active = active.slice(excess);
        }

        const forBalancing: PlayerForBalancing[] = active.map(p => ({
            userId: p.userId,
            displayName: p.name,
            photoURL: p.photoURL,
            overall: p.rating || 50,
            profilePosition: mapPosition(p.position),
            selectedPosition: mapPosition(p.position),
            archetype: 'box-to-box' as Archetype,
        }));
        const result = smart ? balanceTeams(forBalancing) : randomTeams(forBalancing);
        const find = (uid: string) => active.find(p => p.userId === uid);
        const nextA = result.teamA.map(p => find(p.userId)).filter(Boolean);
        const nextB = result.teamB.map(p => find(p.userId)).filter(Boolean);
        // With an odd count the balancer sets the weakest player aside as a joker; they still play,
        // on the side that is short a player (or the weaker one).
        if (result.jokerPlayer) {
            const joker = find(result.jokerPlayer.userId);
            if (joker) {
                const aShort = nextA.length < nextB.length || (nextA.length === nextB.length && result.teamAOverall <= result.teamBOverall);
                (aShort ? nextA : nextB).push(joker);
            }
        }
        setTeamA(nextA);
        setTeamB(nextB);
        setPool(reserve);
        setMode(smart ? 'smart' : 'random');
    };

    const onModeChange = (next: Mode) => {
        if (next === 'manual') {
            setMode('manual');
        } else if (next === 'random') {
            runBalancing(false);
        } else if (!canBalanceTeams(id)) {
            alert(
                'Akıllı Kadro Kurucu',
                'Oyuncuların mevkilerine ve güçlerine göre en dengeli kadroyu otomatik kurmak Kaptan Pro özelliğidir.',
                [
                    { text: 'Vazgeç', style: 'cancel' },
                    { text: 'Rastgele Dağıt', onPress: () => runBalancing(false) },
                    { text: 'Kaptan Pro Al', onPress: () => router.push('/settings/premium') },
                ]
            );
        } else {
            runBalancing(true);
        }
    };

    const moveTo = (player: any, target: Side) => {
        const without = (list: any[]) => list.filter(p => p.id !== player.id);
        setTeamA(prev => (target === 'A' ? [...without(prev), player] : without(prev)));
        setTeamB(prev => (target === 'B' ? [...without(prev), player] : without(prev)));
        setPool(prev => (target === 'Pool' ? [...without(prev), player] : without(prev)));
        setSelected(null);
        setMode('manual');
    };

    const saveTeams = async () => {
        setSaving(true);
        try {
            const { writeBatch, doc } = await import('firebase/firestore');
            const { db } = await import('../../../firebaseConfig');
            const batch = writeBatch(db);
            teamA.forEach((p, index) => batch.update(doc(db, 'match_participants', `${id}_${p.userId}`), { team: 'A', status: 'IN', teamIndex: index }));
            teamB.forEach((p, index) => batch.update(doc(db, 'match_participants', `${id}_${p.userId}`), { team: 'B', status: 'IN', teamIndex: index }));
            // Anyone left in the pool is off both teams and waits on the bench.
            pool.forEach(p => batch.update(doc(db, 'match_participants', `${id}_${p.userId}`), { team: null, status: 'WAITLIST' }));
            await batch.commit();
            alert('Kaydedildi', 'Kadrolar kaydedildi', [], { type: 'success' });
        } catch (error: any) {
            console.error(error);
            alert('Hata', `Kadrolar kaydedilemedi: ${error.message}`, [], { type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const shareText = async () => {
        setShowShare(false);
        const lines = (list: any[]) => list.map(p => `• ${p.name}`).join('\n');
        try {
            await Share.share({
                message: `*${match?.venue || 'Maç'} Kadrosu*\n\n*Takım A* (Ort: ${average(teamA)})\n${lines(teamA)}\n\n*Takım B* (Ort: ${average(teamB)})\n${lines(teamB)}`,
            });
        } catch (error) {
            console.error(error);
        }
    };

    const shareImage = async () => {
        setShowShare(false);
        try {
            const uri = await viewShotRef.current?.capture?.();
            if (!uri) throw new Error('capture failed');
            if (await Sharing.isAvailableAsync()) {
                await Sharing.shareAsync(uri, { mimeType: 'image/png', dialogTitle: 'Kadroyu Paylaş' });
            } else {
                alert('Hata', 'Paylaşım bu cihazda desteklenmiyor', [], { type: 'error' });
            }
        } catch (error) {
            console.error(error);
            alert('Hata', 'Görüntü paylaşılamadı', [], { type: 'error' });
        }
    };

    const avgA = average(teamA);
    const avgB = average(teamB);
    const balance = teamA.length && teamB.length ? Math.max(0, Math.round(100 - (Math.abs(avgA - avgB) / Math.max(avgA, avgB, 1)) * 100)) : 0;
    const pitchW = screenW - 32;
    const teamAName = match?.customizations?.teamAName || 'Takım A';
    const teamBName = match?.customizations?.teamBName || 'Takım B';

    const modeButton = (key: Mode, label: string, icon?: keyof typeof Ionicons.glyphMap, locked?: boolean) => {
        const on = mode === key;
        return (
            <TouchableOpacity
                key={key}
                onPress={() => onModeChange(key)}
                activeOpacity={0.8}
                style={[st.modeBtn, { backgroundColor: on ? C.primary : C.card, borderColor: on ? C.primary : C.border }]}
            >
                {icon && <Ionicons name={locked ? 'lock-closed' : icon} size={14} color={on ? C.onPrimary : locked ? C.gold : C.textSecondary} />}
                <Text style={[st.modeText, { color: on ? C.onPrimary : C.textSecondary }]} numberOfLines={1}>{label}</Text>
            </TouchableOpacity>
        );
    };

    const playerRow = (p: any, side: Side) => (
        <TouchableOpacity key={p.id} activeOpacity={0.7} onPress={() => setSelected({ player: p, side })} style={st.teamItem}>
            <Avatar uri={p.photoURL} name={p.name} size={26} />
            <Text style={[st.teamName, { color: C.text }]} numberOfLines={1}>{compactName(p.name)}</Text>
            <Text style={[st.teamOvr, { color: C.textSecondary }]}>{p.rating}</Text>
        </TouchableOpacity>
    );

    const column = (list: any[], name: string, color: string, side: Side) => (
        <View style={{ flex: 1 }}>
            <View style={st.colHead}>
                <Text style={[st.colTitle, { color }]} numberOfLines={1}>{name.toLocaleUpperCase('tr-TR')}</Text>
                <Text style={[st.colAvg, { color: C.textTertiary }]}>{average(list)} ORT</Text>
            </View>
            {list.length === 0 ? <Text style={[st.muted, { color: C.textTertiary }]}>Boş</Text> : list.map(p => playerRow(p, side))}
        </View>
    );

    if (loading) {
        return (
            <SettingsScreen title="Kadro Kurucu">
                <View style={st.center}><ActivityIndicator size="large" color={C.primaryText} /></View>
            </SettingsScreen>
        );
    }

    return (
        <SettingsScreen
            title="Kadro Kurucu"
            headerRight={
                <TouchableOpacity onPress={saveTeams} disabled={saving} hitSlop={10}>
                    {saving ? <ActivityIndicator color={C.primaryText} /> : <Text style={[st.save, { color: C.link }]}>Kaydet</Text>}
                </TouchableOpacity>
            }
        >
            <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 24 }} showsVerticalScrollIndicator={false}>
                <View style={st.modeRow}>
                    {modeButton('random', 'Rastgele Dağıt', 'shuffle')}
                    {modeButton('smart', 'Akıllı Dengele', 'flash', !canBalanceTeams(id))}
                    {modeButton('manual', 'Manuel', 'hand-left-outline')}
                </View>

                <ViewShot ref={viewShotRef} options={{ format: 'png', quality: 1 }} style={{ marginBottom: 14 }}>
                    <FormationPitch
                        horizontal
                        width={pitchW}
                        height={240}
                        teamA={teamA.map(p => ({ key: p.id, name: p.name, photoURL: p.photoURL }))}
                        teamB={teamB.map(p => ({ key: p.id, name: p.name, photoURL: p.photoURL }))}
                        teamAName={`${teamAName} ${avgA}`}
                        teamBName={`${teamBName} ${avgB}`}
                        footer={
                            <View style={st.watermark}>
                                <Image source={require('../../../assets/images/app-icon.png')} style={st.watermarkIcon} resizeMode="contain" />
                                <Text style={st.watermarkText}>ile oluşturuldu</Text>
                                <Text style={st.watermarkBrand}>MaçVar</Text>
                            </View>
                        }
                    />
                </ViewShot>

                <View style={[st.card, { backgroundColor: C.card, borderColor: C.border }]}>
                    <Eyebrow>Denge Skoru</Eyebrow>
                    <Text style={[st.balance, { color: balance >= 90 ? C.link : balance >= 75 ? C.warning : C.error }]}>
                        {teamA.length && teamB.length ? `%${balance} Dengeli` : '—'}
                    </Text>
                </View>

                <View style={[st.card, st.teams, { backgroundColor: C.card, borderColor: C.border }]}>
                    {column(teamA, teamAName, C.teamA, 'A')}
                    <View style={[st.divider, { backgroundColor: C.divider }]} />
                    {column(teamB, teamBName, C.teamB, 'B')}
                </View>

                <View style={{ marginTop: 18 }}>
                    <Eyebrow style={{ marginBottom: 8 }}>Oyuncu Havuzu ({pool.length})</Eyebrow>
                    {pool.length === 0 ? (
                        <Text style={[st.muted, { color: C.textTertiary }]}>Havuz boş. Bir oyuncuya dokunup havuza alabilirsin.</Text>
                    ) : (
                        <View style={[st.card, { backgroundColor: C.card, borderColor: C.border, paddingVertical: 6 }]}>
                            {pool.map(p => playerRow(p, 'Pool'))}
                        </View>
                    )}
                </View>

                <PrimaryButton label="Kadroyu Paylaş" icon="share-outline" onPress={() => setShowShare(true)} style={{ marginTop: 18 }} />
            </ScrollView>

            <Sheet visible={!!selected} onClose={() => setSelected(null)} title={selected ? compactName(selected.player.name) : ''}>
                {selected && (
                    <>
                        <Text style={[st.sheetSub, { color: C.textSecondary }]}>Güç: {selected.player.rating}</Text>
                        {selected.side !== 'A' && <SheetRow icon="arrow-back-circle-outline" label={`${teamAName} Takımına Al`} onPress={() => moveTo(selected.player, 'A')} right={<View style={[st.swatch, { backgroundColor: C.teamA }]} />} />}
                        {selected.side !== 'B' && <SheetRow icon="arrow-forward-circle-outline" label={`${teamBName} Takımına Al`} onPress={() => moveTo(selected.player, 'B')} right={<View style={[st.swatch, { backgroundColor: C.teamB }]} />} />}
                        {selected.side !== 'Pool' && <SheetRow icon="remove-circle-outline" label="Havuza Al (Yedek)" onPress={() => moveTo(selected.player, 'Pool')} last />}
                    </>
                )}
            </Sheet>

            <Sheet visible={showShare} onClose={() => setShowShare(false)} title="Kadroyu Paylaş">
                <SheetRow icon="chatbubble-outline" label="Metin Olarak" sub="WhatsApp gruplarına uygun liste" onPress={shareText} />
                <SheetRow icon="image-outline" label="Görsel Olarak (PNG)" sub="Saha dizilişinin görüntüsü" onPress={shareImage} last />
            </Sheet>
        </SettingsScreen>
    );
}

const st = StyleSheet.create({
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    muted: { fontSize: 12, fontWeight: '500' },
    save: { fontSize: 14, fontWeight: '800' },

    modeRow: { flexDirection: 'row', gap: 8, marginBottom: 14 },
    modeBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 11, paddingHorizontal: 4, borderRadius: 14, borderWidth: 1 },
    modeText: { fontSize: 12, fontWeight: '700' },

    watermark: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8, backgroundColor: palette.darkStart },
    watermarkIcon: { width: 18, height: 18, borderRadius: 4 },
    watermarkText: { color: withOpacity(palette.white, 0.8), fontSize: 11, fontWeight: '600' },
    watermarkBrand: { color: palette.greenBright, fontSize: 11, fontWeight: '800' },

    card: { borderRadius: 20, borderWidth: 1, padding: 14 },
    balance: { fontSize: 15, fontWeight: '800', marginTop: 4 },
    teams: { flexDirection: 'row', gap: 14, marginTop: 12 },
    divider: { width: 1 },
    colHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6, gap: 6 },
    colTitle: { flex: 1, fontSize: 12.5, fontWeight: '800' },
    colAvg: { fontSize: 10.5, fontWeight: '700' },
    teamItem: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 7 },
    teamName: { flex: 1, fontSize: 13, fontWeight: '700' },
    teamOvr: { fontSize: 11.5, fontWeight: '800' },

    sheetSub: { fontSize: 12.5, textAlign: 'center', marginBottom: 4 },
    swatch: { width: 12, height: 12, borderRadius: 6 },
});
