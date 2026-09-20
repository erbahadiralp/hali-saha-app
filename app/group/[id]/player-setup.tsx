import { Ionicons } from '@expo/vector-icons';
import Slider from '@react-native-community/slider';
import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAlert } from '../../../components/CustomAlertProvider';
import { Avatar, Eyebrow, PrimaryButton, StateView } from '../../../components/group/GroupUI';
import { SettingsScreen, useSettingsColors } from '../../../components/settings/SettingsUI';
import { withOpacity } from '../../../constants/designTokens';
import { getGroupDetails, getGroupMembers, updateGroupMemberDetails } from '../../../services/firestore';
import { Archetype, Position, calculateSkills, getArchetypesForPosition, getDefaultArchetypeForPosition } from '../../../services/overall';

/** Layout: design/tasarım/macvar-screens-6.html (Grup Oyuncu Seviye & Arketip); colors from designTokens. */

interface PlayerData {
    uid: string;
    displayName: string;
    photoURL?: string;
    skillLevel: number;
    archetype: Archetype;
    position: Position;
    /** False until an admin saves a level in this group; team balancing then uses the display overall. */
    rated: boolean;
}

const POSITION_MAPPING: Record<string, Position> = {
    GK: 'GK', KALECI: 'GK', KAL: 'GK',
    DF: 'DF', DEFANS: 'DF', DEF: 'DF', STOPER: 'DF', STOP: 'DF',
    MF: 'MF', MID: 'MF', ORTA: 'MF', ORTASAHA: 'MF',
    FW: 'FW', FWD: 'FW', FORVET: 'FW', FOR: 'FW', GOLCU: 'FW',
};

const POSITION_LABELS: Record<Position, string> = { FW: 'Forvet', MF: 'Orta Saha', DF: 'Defans', GK: 'Kaleci' };

/** Base group overall used by the team builder (kept in sync with updateGroupMemberDetails). */
const previewOverall = (level: number) => Math.min(99, Math.max(40, Math.round(level * 6 + 40)));

export default function PlayerSetupScreen() {
    const { alert } = useAlert();
    const { id } = useLocalSearchParams<{ id: string }>();
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [players, setPlayers] = useState<PlayerData[]>([]);
    const [editing, setEditing] = useState<PlayerData | null>(null);
    const [groupName, setGroupName] = useState('');

    useEffect(() => {
        if (!id) return;
        let active = true;
        (async () => {
            try {
                const [groupData, members]: [any, any[]] = await Promise.all([getGroupDetails(id), getGroupMembers(id)]);
                if (!active) return;
                setGroupName(groupData?.name || '');
                const details: any[] = groupData?.memberDetails || [];
                setPlayers(members.map((member: any) => {
                    const uid = member.odaylarId || member.uid;
                    const position = POSITION_MAPPING[(member.position || 'MF').toUpperCase().trim()] || 'MF';
                    // Group-specific values win over the global profile.
                    const groupEntry = details.find(d => d.uid === uid);
                    const stored = groupEntry?.archetype || member.archetype;
                    return {
                        uid,
                        displayName: member.displayName || 'İsimsiz',
                        photoURL: member.photoURL,
                        skillLevel: groupEntry?.skillLevel || 6,
                        archetype: (stored?.startsWith(position.toLowerCase()) ? stored : getDefaultArchetypeForPosition(position)) as Archetype,
                        position,
                        rated: !!groupEntry?.skillLevel,
                    };
                }));
            } catch (error) {
                console.error('Error loading players:', error);
            } finally {
                if (active) setLoading(false);
            }
        })();
        return () => { active = false; };
    }, [id]);

    // Hardware back leaves the detail view before leaving the screen.
    useEffect(() => {
        if (!editing) return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => { setEditing(null); return true; });
        return () => sub.remove();
    }, [editing]);

    const handleSave = async () => {
        if (!editing || !id) return;
        setSaving(true);
        try {
            // The group entry is the source of truth: it feeds team balancing and, through memberRatings,
            // the player's display overall (recalculated by Cloud Functions).
            await updateGroupMemberDetails(id, editing.uid, editing.skillLevel, editing.archetype);
            setPlayers(prev => prev.map(p => (p.uid === editing.uid ? { ...editing, rated: true } : p)));
            setEditing(null);
            alert('Kaydedildi', `${editing.displayName} güncellendi.`, [], { type: 'success' });
        } catch (error) {
            console.error('Error saving player:', error);
            alert('Hata', error instanceof Error ? error.message : 'Oyuncu kaydedilemedi. Lütfen tekrar dene.', [], { type: 'error' });
        } finally {
            setSaving(false);
        }
    };

    const skillColor = (value: number) => (value >= 70 ? C.link : value >= 50 ? C.warning : C.error);

    /* ─────────────────────────── Detail ─────────────────────────── */

    if (editing) {
        const archetypes = getArchetypesForPosition(editing.position);
        const current = archetypes.find(a => a.value === editing.archetype);
        const skills = calculateSkills(editing.skillLevel, editing.archetype);
        const skillRows = [
            { label: 'Hız', value: skills.speed },
            { label: 'Şut', value: skills.shooting },
            { label: 'Pas', value: skills.passing },
            { label: 'Fizik', value: skills.physical },
            { label: 'Defans', value: skills.defense },
        ];

        return (
            <SettingsScreen title={editing.displayName} onBack={() => setEditing(null)}>
                <Text style={[st.subtitle, { color: C.textSecondary }]}>
                    {groupName ? `${groupName} içindeki seviyesi` : 'Grup içindeki seviyesi'} · {POSITION_LABELS[editing.position]}
                </Text>
                <ScrollView style={{ flex: 1 }} contentContainerStyle={st.content} showsVerticalScrollIndicator={false}>
                    <View style={[st.levelCard, { backgroundColor: C.card, borderColor: C.border }]}>
                        <Eyebrow style={{ marginBottom: 8 }}>Grup Seviyesi</Eyebrow>
                        <Text style={[st.levelValue, { color: C.link }]}>
                            {editing.skillLevel}
                            <Text style={[st.levelMax, { color: C.textTertiary }]}>/10</Text>
                        </Text>
                        <Slider
                            style={st.slider}
                            minimumValue={1}
                            maximumValue={10}
                            step={1}
                            value={editing.skillLevel}
                            onValueChange={value => setEditing(prev => (prev ? { ...prev, skillLevel: value } : prev))}
                            minimumTrackTintColor={C.link}
                            maximumTrackTintColor={C.segment}
                            thumbTintColor={C.link}
                        />
                        <View style={st.sliderLabels}>
                            <Text style={[st.sliderLabel, { color: C.textTertiary }]}>Başlangıç</Text>
                            <Text style={[st.sliderLabel, { color: C.textSecondary }]}>Tahmini OVR {previewOverall(editing.skillLevel)}</Text>
                            <Text style={[st.sliderLabel, { color: C.textTertiary }]}>Efsane</Text>
                        </View>
                    </View>

                    <Eyebrow style={{ marginBottom: 10 }}>Oyuncu Arketipi</Eyebrow>
                    <View style={st.chips}>
                        {archetypes.map(arch => {
                            const on = arch.value === editing.archetype;
                            return (
                                <TouchableOpacity
                                    key={arch.value}
                                    onPress={() => setEditing(prev => (prev ? { ...prev, archetype: arch.value } : prev))}
                                    activeOpacity={0.7}
                                    style={[
                                        st.chip,
                                        { backgroundColor: on ? withOpacity(C.primary, 0.12) : C.iconTile, borderColor: on ? C.primary : C.transparent },
                                    ]}
                                >
                                    <Text style={[st.chipText, { color: on ? C.link : C.textSecondary }]}>{arch.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    {current && <Text style={[st.archDesc, { color: C.textTertiary }]}>{current.description}</Text>}

                    <Eyebrow style={{ marginTop: 20, marginBottom: 14 }}>Yetenek Dağılımı</Eyebrow>
                    {skillRows.map(skill => (
                        <View key={skill.label} style={st.skillRow}>
                            <Text style={[st.skillLabel, { color: C.text }]}>{skill.label}</Text>
                            <View style={[st.track, { backgroundColor: C.segment }]}>
                                <View style={[st.fill, { width: `${skill.value}%`, backgroundColor: skillColor(skill.value) }]} />
                            </View>
                            <Text style={[st.skillVal, { color: C.text }]}>{skill.value}</Text>
                        </View>
                    ))}
                </ScrollView>
                <View style={[st.footer, { paddingBottom: insets.bottom + 12 }]}>
                    <PrimaryButton
                        label="Kaydet"
                        onPress={handleSave}
                        disabled={saving}
                        loading={saving ? <ActivityIndicator color={C.onPrimary} /> : undefined}
                    />
                </View>
            </SettingsScreen>
        );
    }

    /* ─────────────────────────── List ─────────────────────────── */

    return (
        <SettingsScreen title="Oyuncu Güçleri">
            {!!groupName && <Text style={[st.subtitle, { color: C.textSecondary }]}>{groupName} · seviye ve arketip ayarları</Text>}
            {loading ? (
                <ActivityIndicator style={{ marginTop: 48 }} color={C.primaryText} />
            ) : players.length === 0 ? (
                <StateView icon="people-outline" title="Grupta oyuncu yok" text="Üyeler katıldığında seviyelerini buradan ayarlayabilirsin." />
            ) : (
                <ScrollView style={{ flex: 1 }} contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 32 }]} showsVerticalScrollIndicator={false}>
                    <Text style={[st.hint, { color: C.textTertiary }]}>
                        Her oyuncu için seviye (1-10) ve arketip seç; takım kurucu güçleri buna göre dengeler.
                    </Text>
                    {players.map((player, i) => {
                        const arch = getArchetypesForPosition(player.position).find(a => a.value === player.archetype);
                        return (
                            <TouchableOpacity
                                key={player.uid}
                                onPress={() => setEditing(player)}
                                activeOpacity={0.6}
                                style={[st.row, { borderBottomColor: C.divider }, i === players.length - 1 && st.rowLast]}
                            >
                                <Avatar uri={player.photoURL} name={player.displayName} size={40} />
                                <View style={{ flex: 1 }}>
                                    <Text style={[st.rowTitle, { color: C.text }]} numberOfLines={1}>{player.displayName}</Text>
                                    <Text style={[st.rowSub, { color: C.textSecondary }]} numberOfLines={1}>
                                        {POSITION_LABELS[player.position]} · {arch?.label ?? 'Arketip yok'}
                                    </Text>
                                </View>
                                <View style={[st.levelPill, { backgroundColor: player.rated ? withOpacity(C.primary, 0.14) : withOpacity(C.warning, 0.14) }]}>
                                    <Text style={[st.levelPillText, { color: player.rated ? C.link : C.warning }]}>
                                        {player.rated ? `${player.skillLevel}/10` : 'Ayarlanmadı'}
                                    </Text>
                                </View>
                                <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}
        </SettingsScreen>
    );
}

const st = StyleSheet.create({
    subtitle: { fontSize: 12.5, fontWeight: '600', paddingHorizontal: 20, marginTop: -4, marginBottom: 14 },
    content: { paddingHorizontal: 20, paddingBottom: 24 },
    hint: { fontSize: 12.5, fontWeight: '600', lineHeight: 19, marginBottom: 6 },

    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
    rowLast: { borderBottomWidth: 0 },
    rowTitle: { fontSize: 14.5, fontWeight: '700' },
    rowSub: { fontSize: 12, fontWeight: '600', marginTop: 2 },
    levelPill: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999 },
    levelPillText: { fontSize: 12, fontWeight: '800' },

    levelCard: { borderRadius: 20, borderWidth: 1, padding: 18, alignItems: 'center', marginBottom: 18 },
    levelValue: { fontSize: 36, fontWeight: '800' },
    levelMax: { fontSize: 16, fontWeight: '700' },
    slider: { alignSelf: 'stretch', height: 36, marginTop: 6 },
    sliderLabels: { alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between' },
    sliderLabel: { fontSize: 11, fontWeight: '600' },

    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    chip: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 12, borderWidth: 1.5 },
    chipText: { fontSize: 12.5, fontWeight: '700' },
    archDesc: { fontSize: 12, fontWeight: '600', marginTop: 10 },

    skillRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 },
    skillLabel: { width: 64, fontSize: 13, fontWeight: '700' },
    track: { flex: 1, height: 8, borderRadius: 99, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 99 },
    skillVal: { width: 26, textAlign: 'right', fontSize: 12.5, fontWeight: '800' },

    footer: { paddingHorizontal: 20, paddingTop: 8 },
});
