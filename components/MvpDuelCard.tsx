import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeInLeft, FadeInRight, LinearTransition } from 'react-native-reanimated';
import { withOpacity } from '../constants/designTokens';
import { BadgeType, getPlayerBadges, MvpCandidate } from '../services/mvpLogic';
import { Avatar, compactName } from './group/GroupUI';
import { useSettingsColors } from './settings/SettingsUI';

/** Duel candidate card (design: MVP Oylaması › .duel-card); colors from designTokens. */

interface MvpDuelCardProps {
    candidate: MvpCandidate;
    allCandidates: MvpCandidate[];
    onSelect: () => void;
    state: 'idle' | 'selected' | 'lost';
    side: 'left' | 'right';
    disabled: boolean;
}

const BADGES: Record<BadgeType, { icon: keyof typeof Ionicons.glyphMap; label: string }> = {
    'gol-krali': { icon: 'flame', label: 'Gol Kralı' },
    'duvar': { icon: 'shield', label: 'Duvar' },
    'asistci': { icon: 'bulb', label: 'Asistçi' },
    'mvp-yuksek': { icon: 'star', label: 'Yüksek Puan' },
};

const POSITIONS: Record<string, string> = { FW: 'Forvet', MF: 'Orta Saha', DF: 'Defans', GK: 'Kaleci' };

export const MvpDuelCard = ({ candidate, allCandidates, onSelect, state, side, disabled }: MvpDuelCardProps) => {
    const C = useSettingsColors();
    const badges = getPlayerBadges(candidate, allCandidates);
    const selected = state === 'selected';

    return (
        <Animated.View
            entering={side === 'left' ? FadeInLeft.springify().damping(14) : FadeInRight.springify().damping(14)}
            layout={LinearTransition.springify()}
            style={[st.wrap, state === 'lost' && st.lost]}
        >
            <TouchableOpacity
                activeOpacity={0.85}
                onPress={onSelect}
                disabled={disabled}
                accessibilityRole="button"
                accessibilityState={{ selected }}
                style={[
                    st.card,
                    { backgroundColor: selected ? withOpacity(C.accent, 0.12) : C.card, borderColor: selected ? C.link : C.border },
                ]}
            >
                {selected && (
                    <View style={[st.check, { backgroundColor: C.primary }]}>
                        <Ionicons name="checkmark" size={14} color={C.onPrimary} />
                    </View>
                )}
                <Avatar uri={candidate.photoURL || undefined} name={candidate.displayName} size={64} radius={18} />
                <Text style={[st.name, { color: C.text }]} numberOfLines={1}>{compactName(candidate.displayName)}</Text>
                <Text style={[st.position, { color: C.textTertiary }]}>{POSITIONS[candidate.position] || candidate.position}</Text>
                <Text style={[st.stat, { color: C.textSecondary }]}>
                    {candidate.stats.goals} Gol · {candidate.stats.assists} Asist · {Math.round(candidate.mvpScore)} Puan
                </Text>
                {(badges.length > 0 || candidate.isJoker) && (
                    <View style={st.badges}>
                        {candidate.isJoker && (
                            <View style={[st.badge, { backgroundColor: withOpacity(C.gold, 0.15) }]}>
                                <Text style={[st.badgeText, { color: C.gold }]}>Joker</Text>
                            </View>
                        )}
                        {badges.map(b => (
                            <View key={b} style={[st.badge, { backgroundColor: C.iconTile }]}>
                                <Ionicons name={BADGES[b].icon} size={10} color={C.gold} />
                                <Text style={[st.badgeText, { color: C.textSecondary }]}>{BADGES[b].label}</Text>
                            </View>
                        ))}
                    </View>
                )}
            </TouchableOpacity>
        </Animated.View>
    );
};

const st = StyleSheet.create({
    wrap: { flex: 1 },
    lost: { opacity: 0.45 },
    card: { flex: 1, borderRadius: 20, borderWidth: 1.5, paddingVertical: 20, paddingHorizontal: 12, alignItems: 'center' },
    check: { position: 'absolute', top: 10, right: 10, width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
    name: { fontSize: 14.5, fontWeight: '800', marginTop: 10 },
    position: { fontSize: 10.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 2 },
    stat: { fontSize: 11.5, fontWeight: '600', marginTop: 6, textAlign: 'center' },
    badges: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 4, marginTop: 10 },
    badge: { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 7, paddingVertical: 3, borderRadius: 999 },
    badgeText: { fontSize: 9.5, fontWeight: '700' },
});
