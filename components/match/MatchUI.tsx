import { differenceInCalendarDays, format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { ReactNode } from 'react';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { palette, withOpacity } from '../../constants/designTokens';
import { useSettingsColors } from '../settings/SettingsUI';

/**
 * Shared pieces for the match flow (design/tasarım: Maçlarım, Maç Detayı, Kadro Kurucu).
 * The pitch is intentionally green in both themes; every value still comes from designTokens.
 */

export const ON_PITCH = palette.white;
export const ON_PITCH_MUTED = withOpacity(palette.white, 0.78);
export const PITCH_PILL = withOpacity(palette.black, 0.4);
const PITCH_BASE = palette.darkGreen;
const PITCH_STRIPE = withOpacity(palette.greenBright, 0.14);
const PITCH_LINE = withOpacity(palette.white, 0.35);

/** "BUGÜN 21:00", "YARIN 22:00", "CUMA 20:00" or "24 OCA 21:00". */
export const matchDayLabel = (date: Date, now = new Date()) => {
    const days = differenceInCalendarDays(date, now);
    const day = days === 0 ? 'Bugün' : days === 1 ? 'Yarın' : days > 1 && days < 7 ? format(date, 'EEEE', { locale: tr }) : format(date, 'd MMM', { locale: tr });
    return `${day} ${format(date, 'HH:mm')}`.toLocaleUpperCase('tr-TR');
};

export const formatLabel = (maxPlayers?: number) => {
    const perTeam = Math.round((maxPlayers || 14) / 2);
    return `${perTeam}v${perTeam}`;
};

export function PitchPill({ label, style }: { label: string; style?: object }) {
    return (
        <View style={[st.pitchPill, style]}>
            <Text style={st.pitchPillText} numberOfLines={1}>{label}</Text>
        </View>
    );
}

/** Striped pitch card with a centre line and a darkening gradient for legible text. */
export function PitchCard({ children, style, stripes = 10, fade = 0.85 }: { children?: ReactNode; style?: object; stripes?: number; fade?: number }) {
    return (
        <View style={[st.pitchCard, style]}>
            <View style={[StyleSheet.absoluteFill, st.row]} pointerEvents="none">
                {Array.from({ length: stripes }).map((_, i) => (
                    <View key={i} style={{ flex: 1, backgroundColor: i % 2 ? PITCH_STRIPE : palette.transparent }} />
                ))}
            </View>
            <View style={st.centerLine} pointerEvents="none" />
            <LinearGradient
                colors={[withOpacity(palette.black, 0.05), withOpacity(palette.black, fade * 0.7)]}
                start={{ x: 0, y: 0 }}
                end={{ x: 0, y: 0.9 }}
                style={StyleSheet.absoluteFill}
                pointerEvents="none"
            />
            {children}
        </View>
    );
}

/* ─────────────────────────── Formation pitch ─────────────────────────── */

export interface PitchPlayer {
    key: string;
    name: string;
    photoURL?: string | null;
}

// Outfield rows (from defence to attack) for a given team size, goalkeeper excluded.
const ROWS: Record<number, number[]> = {
    1: [], 2: [1], 3: [2], 4: [2, 1], 5: [2, 2], 6: [2, 2, 1], 7: [3, 2, 1],
    8: [3, 3, 1], 9: [3, 3, 2], 10: [4, 3, 2], 11: [4, 4, 2],
};

/** Positions as depth (0 = own goal line, 0.5 = halfway) and lateral (0–1 across). */
function formation(size: number) {
    if (size <= 0) return [];
    const rows = ROWS[size] ?? [4, 4, size - 9];
    const spots = [{ depth: 0.06, lateral: 0.5 }];
    rows.forEach((count, r) => {
        const depth = rows.length === 1 ? 0.3 : 0.17 + (r / (rows.length - 1)) * 0.26;
        for (let i = 0; i < count; i++) spots.push({ depth, lateral: (i + 1) / (count + 1) });
    });
    return spots;
}

export function FormationPitch({ teamA, teamB, teamAName = 'Takım A', teamBName = 'Takım B', width, height, horizontal, footer }: {
    teamA: PitchPlayer[];
    teamB: PitchPlayer[];
    teamAName?: string;
    teamBName?: string;
    width: number;
    height: number;
    /** Teams side by side (A left) instead of stacked (B top). */
    horizontal?: boolean;
    footer?: ReactNode;
}) {
    const C = useSettingsColors();
    const dot = 30;
    const labelW = 64;

    const place = (players: PitchPlayer[], team: 'A' | 'B') => {
        const spots = formation(players.length);
        const color = team === 'A' ? C.teamA : C.teamB;
        return players.map((p, i) => {
            const s = spots[i] ?? { depth: 0.45, lateral: 0.5 };
            const x = horizontal ? (team === 'A' ? s.depth : 1 - s.depth) : s.lateral;
            const y = horizontal ? s.lateral : (team === 'B' ? s.depth : 1 - s.depth);
            return (
                <View key={p.key} style={[st.player, { left: x * width - labelW / 2, top: y * height - dot / 2, width: labelW }]}>
                    <View style={[st.dot, { width: dot, height: dot, borderRadius: dot / 2, backgroundColor: color }]}>
                        {p.photoURL
                            ? <Image source={{ uri: p.photoURL }} style={StyleSheet.absoluteFill} />
                            : <Text style={st.dotText}>{(p.name || '?').charAt(0).toLocaleUpperCase('tr-TR')}</Text>}
                    </View>
                    <View style={st.nameTag}>
                        <Text style={st.nameTagText} numberOfLines={1}>{(p.name || '').split(' ')[0]}</Text>
                    </View>
                </View>
            );
        });
    };

    const box = (w: number, h: number) => (horizontal ? { width: h, height: w } : { width: w, height: h });
    const boxW = Math.min(170, (horizontal ? height : width) * 0.5);

    return (
        <View style={[st.formation, { width }]}>
            <View style={{ width, height, backgroundColor: PITCH_BASE, overflow: 'hidden' }}>
                <View style={[StyleSheet.absoluteFill, { flexDirection: horizontal ? 'row' : 'column' }]} pointerEvents="none">
                    {Array.from({ length: 8 }).map((_, i) => (
                        <View key={i} style={{ flex: 1, backgroundColor: i % 2 ? PITCH_STRIPE : palette.transparent }} />
                    ))}
                </View>
                {/* Markings */}
                <View style={[st.line, horizontal ? { left: width / 2 - 1, top: 0, bottom: 0, width: 2 } : { top: height / 2 - 1, left: 0, right: 0, height: 2 }]} />
                <View style={[st.circle, { left: width / 2 - 32, top: height / 2 - 32 }]} />
                {horizontal ? (
                    <>
                        <View style={[st.boxMark, box(boxW, 56), { left: 0, top: height / 2 - boxW / 2, borderLeftWidth: 0 }]} />
                        <View style={[st.boxMark, box(boxW, 56), { right: 0, top: height / 2 - boxW / 2, borderRightWidth: 0 }]} />
                    </>
                ) : (
                    <>
                        <View style={[st.boxMark, box(boxW, 56), { top: 0, left: width / 2 - boxW / 2, borderTopWidth: 0 }]} />
                        <View style={[st.boxMark, box(boxW, 56), { bottom: 0, left: width / 2 - boxW / 2, borderBottomWidth: 0 }]} />
                    </>
                )}

                <View style={[st.teamTag, horizontal ? { top: 8, left: 8 } : { bottom: 8, left: 8 }]}>
                    <Text style={[st.teamTagText, { color: C.teamA }]} numberOfLines={1}>{teamAName} ({teamA.length})</Text>
                </View>
                <View style={[st.teamTag, horizontal ? { top: 8, right: 8 } : { top: 8, left: 8 }]}>
                    <Text style={[st.teamTagText, { color: C.teamB }]} numberOfLines={1}>{teamBName} ({teamB.length})</Text>
                </View>

                {place(teamA, 'A')}
                {place(teamB, 'B')}
            </View>
            {footer}
        </View>
    );
}

/** Rating colour on a 0–100 scale. */
export function ratingColor(C: ReturnType<typeof useSettingsColors>, rating: number) {
    if (rating >= 75) return C.link;
    if (rating >= 55) return C.warning;
    return C.error;
}

const st = StyleSheet.create({
    row: { flexDirection: 'row' },
    pitchCard: { borderRadius: 20, overflow: 'hidden', backgroundColor: PITCH_BASE, padding: 16 },
    centerLine: { position: 'absolute', top: 0, bottom: 0, left: '50%', width: 2, marginLeft: -1, backgroundColor: PITCH_LINE },
    pitchPill: { backgroundColor: PITCH_PILL, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, alignSelf: 'flex-start' },
    pitchPillText: { color: ON_PITCH, fontSize: 11.5, fontWeight: '800', letterSpacing: 0.2 },

    formation: { borderRadius: 20, overflow: 'hidden', alignSelf: 'center' },
    line: { position: 'absolute', backgroundColor: PITCH_LINE },
    circle: { position: 'absolute', width: 64, height: 64, borderRadius: 32, borderWidth: 2, borderColor: PITCH_LINE },
    boxMark: { position: 'absolute', borderWidth: 2, borderColor: PITCH_LINE },
    teamTag: { position: 'absolute', backgroundColor: PITCH_PILL, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, maxWidth: '45%' },
    teamTagText: { fontSize: 11.5, fontWeight: '800' },
    player: { position: 'absolute', alignItems: 'center', zIndex: 2 },
    dot: { borderWidth: 2, borderColor: ON_PITCH, overflow: 'hidden', alignItems: 'center', justifyContent: 'center' },
    dotText: { color: ON_PITCH, fontSize: 11, fontWeight: '800' },
    nameTag: { backgroundColor: withOpacity(palette.black, 0.65), borderRadius: 4, paddingHorizontal: 4, marginTop: 2, maxWidth: 64 },
    nameTagText: { color: ON_PITCH, fontSize: 8.5, fontWeight: '700' },
});
