import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View, ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, G, Line, LinearGradient, Polygon, RadialGradient, Rect, Stop } from 'react-native-svg';
import { palette, withOpacity } from '../../constants/designTokens';

/**
 * Night stadium scene from design/splash-welcome.png, drawn in SVG so no photo asset is needed.
 * It depicts a floodlit pitch, so it stays dark in both themes; only `fadeTo` follows the theme,
 * blending the bottom edge into whatever sits below it.
 */

const W = 400;
const H = 460;
const HORIZON = 285;
const FLARE = { x: 200, y: 92 };

// Floodlight clusters: rows of lamps on each side of the stand roof.
const LAMPS_LEFT = [
    { x: 24, y: 70 }, { x: 40, y: 70 }, { x: 56, y: 70 },
    { x: 30, y: 84 }, { x: 46, y: 84 }, { x: 62, y: 84 },
    { x: 40, y: 98 }, { x: 56, y: 98 }, { x: 72, y: 98 },
    { x: 96, y: 138 }, { x: 108, y: 138 }, { x: 120, y: 138 },
];
const LAMPS_RIGHT = LAMPS_LEFT.map(l => ({ x: W - l.x, y: l.y }));

// Mowing stripes widen towards the viewer.
const STRIPES = [0, 1, 2, 3, 4, 5, 6];

export default function StadiumHero({ fadeTo, style, showLogo = true, logoSize = 104 }: {
    fadeTo: string;
    style?: ViewStyle;
    showLogo?: boolean;
    logoSize?: number;
}) {
    const white = palette.white;

    return (
        <View style={[st.root, style]}>
            <Svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="xMidYMid slice">
                <Defs>
                    <LinearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={palette.darkStart} />
                        <Stop offset="0.45" stopColor={palette.darkEnd} />
                        <Stop offset="1" stopColor={palette.darkGreen} stopOpacity={0.9} />
                    </LinearGradient>
                    <RadialGradient id="glow" cx={FLARE.x} cy={FLARE.y + 40} rx={260} ry={220} gradientUnits="userSpaceOnUse">
                        <Stop offset="0" stopColor={palette.greenBright} stopOpacity={0.45} />
                        <Stop offset="0.5" stopColor={palette.green} stopOpacity={0.16} />
                        <Stop offset="1" stopColor={palette.green} stopOpacity={0} />
                    </RadialGradient>
                    <RadialGradient id="flare" cx={FLARE.x} cy={FLARE.y} r={46} gradientUnits="userSpaceOnUse">
                        <Stop offset="0" stopColor={white} stopOpacity={1} />
                        <Stop offset="0.25" stopColor={white} stopOpacity={0.75} />
                        <Stop offset="1" stopColor={white} stopOpacity={0} />
                    </RadialGradient>
                    <RadialGradient id="lamp" cx="0.5" cy="0.5" r="0.5">
                        <Stop offset="0" stopColor={white} stopOpacity={0.9} />
                        <Stop offset="1" stopColor={white} stopOpacity={0} />
                    </RadialGradient>
                    <LinearGradient id="stands" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={palette.darkStart} stopOpacity={0.2} />
                        <Stop offset="1" stopColor={palette.darkStart} stopOpacity={0.85} />
                    </LinearGradient>
                    <LinearGradient id="pitch" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={palette.darkGreen} />
                        <Stop offset="1" stopColor={palette.green} stopOpacity={0.55} />
                    </LinearGradient>
                    <LinearGradient id="fade" x1="0" y1="0" x2="0" y2="1">
                        <Stop offset="0" stopColor={fadeTo} stopOpacity={0} />
                        <Stop offset="1" stopColor={fadeTo} stopOpacity={1} />
                    </LinearGradient>
                </Defs>

                <Rect x={0} y={0} width={W} height={H} fill="url(#sky)" />
                <Rect x={0} y={0} width={W} height={H} fill="url(#glow)" />

                {/* Light rays falling from the main flare */}
                <G opacity={0.08}>
                    <Polygon points={`${FLARE.x - 3},${FLARE.y} ${FLARE.x + 3},${FLARE.y} ${FLARE.x + 150},${HORIZON} ${FLARE.x + 60},${HORIZON}`} fill={white} />
                    <Polygon points={`${FLARE.x - 3},${FLARE.y} ${FLARE.x + 3},${FLARE.y} ${FLARE.x - 60},${HORIZON} ${FLARE.x - 150},${HORIZON}`} fill={white} />
                </G>

                {/* Stands and roof */}
                <Rect x={0} y={150} width={W} height={HORIZON - 150} fill="url(#stands)" />
                <Line x1={0} y1={150} x2={W} y2={150} stroke={white} strokeOpacity={0.08} strokeWidth={1} />
                <Line x1={0} y1={228} x2={W} y2={228} stroke={white} strokeOpacity={0.05} strokeWidth={1} />

                {/* Floodlights */}
                {[...LAMPS_LEFT, ...LAMPS_RIGHT].map((lamp, i) => (
                    <G key={i}>
                        <Circle cx={lamp.x} cy={lamp.y} r={9} fill="url(#lamp)" opacity={0.55} />
                        <Circle cx={lamp.x} cy={lamp.y} r={2.2} fill={white} />
                    </G>
                ))}

                {/* Pitch with perspective stripes and markings */}
                <Rect x={0} y={HORIZON} width={W} height={H - HORIZON} fill="url(#pitch)" />
                {STRIPES.map(i => {
                    const topL = -40 + i * 70;
                    const botL = -260 + i * 150;
                    return i % 2 === 0 ? (
                        <Polygon
                            key={i}
                            points={`${topL},${HORIZON} ${topL + 35},${HORIZON} ${botL + 75},${H} ${botL},${H}`}
                            fill={white}
                            opacity={0.035}
                        />
                    ) : null;
                })}
                <Line x1={0} y1={HORIZON} x2={W} y2={HORIZON} stroke={white} strokeOpacity={0.3} strokeWidth={1.2} />
                <Polygon points={`${FLARE.x - 1.2},${HORIZON} ${FLARE.x + 1.2},${HORIZON} ${FLARE.x + 7},${H} ${FLARE.x - 7},${H}`} fill={white} opacity={0.5} />
                <Ellipse cx={FLARE.x} cy={HORIZON + 26} rx={96} ry={17} fill="none" stroke={white} strokeOpacity={0.28} strokeWidth={1.4} />

                {/* Main flare with star streaks */}
                <Circle cx={FLARE.x} cy={FLARE.y} r={46} fill="url(#flare)" />
                <Line x1={FLARE.x - 70} y1={FLARE.y} x2={FLARE.x + 70} y2={FLARE.y} stroke={white} strokeOpacity={0.6} strokeWidth={1} />
                <Line x1={FLARE.x} y1={FLARE.y - 60} x2={FLARE.x} y2={FLARE.y + 60} stroke={white} strokeOpacity={0.6} strokeWidth={1} />
                <Line x1={FLARE.x - 26} y1={FLARE.y - 26} x2={FLARE.x + 26} y2={FLARE.y + 26} stroke={white} strokeOpacity={0.3} strokeWidth={0.8} />
                <Line x1={FLARE.x + 26} y1={FLARE.y - 26} x2={FLARE.x - 26} y2={FLARE.y + 26} stroke={white} strokeOpacity={0.3} strokeWidth={0.8} />

                <Rect x={0} y={H * 0.72} width={W} height={H * 0.28} fill="url(#fade)" />
            </Svg>

            {showLogo && (
                <View pointerEvents="none" style={[st.logoWrap]}>
                    <View
                        style={[
                            st.logo,
                            {
                                width: logoSize,
                                height: logoSize,
                                borderRadius: logoSize * 0.25,
                                backgroundColor: withOpacity(palette.white, 0.1),
                                borderColor: withOpacity(palette.white, 0.22),
                            },
                        ]}
                    >
                        <View
                            style={[
                                st.logoRing,
                                {
                                    width: logoSize * 0.54,
                                    height: logoSize * 0.54,
                                    borderRadius: logoSize * 0.27,
                                    borderColor: palette.greenBright,
                                },
                            ]}
                        >
                            <Ionicons name="football-outline" size={logoSize * 0.32} color={palette.greenBright} />
                        </View>
                    </View>
                </View>
            )}
        </View>
    );
}

const st = StyleSheet.create({
    root: { width: '100%', overflow: 'hidden' },
    // The logo tile sits where the pitch meets the stands, as in the design.
    logoWrap: { ...StyleSheet.absoluteFill,alignItems: 'center', justifyContent: 'center', paddingTop: '12%' },
    logo: { alignItems: 'center', justifyContent: 'center', borderWidth: 1 },
    logoRing: { alignItems: 'center', justifyContent: 'center', borderWidth: 2.5 },
});
