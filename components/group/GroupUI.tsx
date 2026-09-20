import { Ionicons } from '@expo/vector-icons';
import { ReactNode, useEffect, useState } from 'react';
import { Image } from 'expo-image';
import { BackHandler, KeyboardAvoidingView, LayoutChangeEvent, Modal, Platform, Pressable, StyleProp, StyleSheet, Text, TextInput, TextInputProps, TextStyle, TouchableOpacity, View, ViewStyle } from 'react-native';
import Animated, { Extrapolation, FadeIn, SharedValue, SlideInDown, interpolate, interpolateColor, useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, withOpacity } from '../../constants/designTokens';
import { useSettingsColors } from '../settings/SettingsUI';

/**
 * Shared pieces for the group screens (design/tasarım: Gruplarım, Grup Detayı, Grup Kasası, Yeni Grup).
 * Colors come only from designTokens via useSettingsColors.
 */

export const toDate = (value: any): Date => {
    if (value && typeof value.toDate === 'function') return value.toDate();
    if (value instanceof Date) return value;
    return value ? new Date(value) : new Date(0);
};

export const formatTL = (amount: number) => `₺${Math.round(amount).toLocaleString('tr-TR')}`;

export const initials = (name?: string) => {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    return (parts.length >= 2 ? parts[0][0] + parts[parts.length - 1][0] : name.substring(0, 2)).toLocaleUpperCase('tr-TR');
};

export const compactName = (name?: string) => {
    if (!name) return 'İsimsiz';
    const parts = name.trim().split(/\s+/);
    return parts.length >= 2 ? `${parts[0]} ${parts[parts.length - 1][0]}.` : name;
};

export function Avatar({ uri, name, size = 38, radius, ring }: { uri?: string; name?: string; size?: number; radius?: number; ring?: string }) {
    const C = useSettingsColors();
    return (
        <View
            style={{
                width: size,
                height: size,
                borderRadius: radius ?? size / 2,
                backgroundColor: C.avatar,
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
                ...(ring ? { borderWidth: 2.5, borderColor: ring } : null),
            }}
        >
            {uri
                ? <Image source={{ uri }} recyclingKey={uri} style={StyleSheet.absoluteFill} />
                : <Text style={{ color: C.textSecondary, fontWeight: '700', fontSize: Math.max(10, size * 0.34) }}>{initials(name)}</Text>}
        </View>
    );
}

export function Eyebrow({ children, style }: { children: ReactNode; style?: object }) {
    const C = useSettingsColors();
    return <Text style={[st.eyebrow, { color: C.textSecondary }, style]}>{children}</Text>;
}

export function Pill({ label, color, icon }: { label: string; color?: string; icon?: keyof typeof Ionicons.glyphMap }) {
    const C = useSettingsColors();
    const fg = color ?? C.textSecondary;
    return (
        <View style={[st.pill, { backgroundColor: color ? withOpacity(color, 0.15) : C.iconTile }]}>
            {icon && <Ionicons name={icon} size={12} color={fg} />}
            <Text style={[st.pillText, { color: fg }]}>{label}</Text>
        </View>
    );
}

/** Text color that fades between inactive and active as the pager's progress nears this tab. */
function TabLabel({ label, index, progress, on, activeColor, inactiveColor, style }: {
    label: string;
    index: number;
    progress?: SharedValue<number>;
    on: boolean;
    activeColor: string;
    inactiveColor: string;
    style: StyleProp<TextStyle>;
}) {
    const animated = useAnimatedStyle(() => {
        if (!progress) return {};
        const closeness = 1 - Math.min(1, Math.abs(progress.value - index));
        return { color: interpolateColor(closeness, [0, 1], [inactiveColor, activeColor]) };
    });
    return <Animated.Text style={[style, { color: on ? activeColor : inactiveColor }, animated]} numberOfLines={1}>{label}</Animated.Text>;
}

/** Interpolates across per-tab values; a single tab just returns its value. */
// Worklet helpers use plain loops: React Compiler hoists inline callbacks such as `(_, i) => i` out of
// the worklet into regular JS functions, which the UI thread is not allowed to call.
function allPositive(values: number[]) {
    'worklet';
    for (let i = 0; i < values.length; i++) {
        if (!(values[i] > 0)) return false;
    }
    return true;
}

function lerpAt(progress: number, values: number[]) {
    'worklet';
    if (values.length === 1) return values[0];
    const input: number[] = [];
    for (let i = 0; i < values.length; i++) input.push(i);
    return interpolate(progress, input, values, Extrapolation.CLAMP);
}

/**
 * Underlined tab strip (design: .tabstrip). With `progress` (from SwipePager) the underline slides
 * and resizes with the swipe instead of jumping between tabs.
 */
export function TabStrip<T extends string>({ tabs, active, onChange, progress }: {
    tabs: { key: T; label: string; badge?: number }[];
    active: T;
    onChange: (key: T) => void;
    progress?: SharedValue<number>;
}) {
    const C = useSettingsColors();
    const xs = useSharedValue<number[]>([]);
    const widths = useSharedValue<number[]>([]);

    const onTabLayout = (i: number, e: LayoutChangeEvent) => {
        const { x, width } = e.nativeEvent.layout;
        const currentX = xs.get();
        const currentW = widths.get();
        const nextX = tabs.map((_, k) => currentX[k] ?? 0);
        const nextW = tabs.map((_, k) => currentW[k] ?? 0);
        nextX[i] = x;
        nextW[i] = width;
        xs.set(nextX);
        widths.set(nextW);
    };

    // Only plain values may be captured by worklets (they are copied to the UI thread).
    const tabCount = tabs.length;
    const indicator = useAnimatedStyle(() => {
        const x = xs.value;
        const w = widths.value;
        if (!progress || w.length !== tabCount || !allPositive(w)) return { opacity: 0 };
        return { opacity: 1, width: lerpAt(progress.value, w), transform: [{ translateX: lerpAt(progress.value, x) }] };
    });

    return (
        <View style={[st.tabStrip, { borderBottomColor: C.divider }]}>
            {tabs.map((tab, i) => {
                const on = tab.key === active;
                return (
                    <TouchableOpacity
                        key={tab.key}
                        onPress={() => onChange(tab.key)}
                        onLayout={progress ? e => onTabLayout(i, e) : undefined}
                        activeOpacity={0.7}
                        style={[st.tab, !progress && on && { borderBottomColor: C.link }]}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: on }}
                    >
                        <TabLabel label={tab.label} index={i} progress={progress} on={on} activeColor={C.text} inactiveColor={C.textTertiary} style={st.tabText} />
                        {!!tab.badge && (
                            <View style={[st.tabBadge, { backgroundColor: C.error }]}>
                                <Text style={[st.tabBadgeText, { color: C.onPrimary }]}>{tab.badge}</Text>
                            </View>
                        )}
                    </TouchableOpacity>
                );
            })}
            {progress && <Animated.View pointerEvents="none" style={[st.tabIndicator, { backgroundColor: C.link }, indicator]} />}
        </View>
    );
}

const SEG_PADDING = 4;
const SEG_GAP = 4;

/**
 * Pill-style segmented control (design: .segmented). With `progress` (from SwipePager) the selected
 * pill slides under the labels while swiping.
 */
export function Segmented<T extends string>({ options, value, onChange, style, progress }: {
    options: { key: T; label: string; icon?: keyof typeof Ionicons.glyphMap }[];
    value: T;
    onChange: (key: T) => void;
    style?: object;
    progress?: SharedValue<number>;
}) {
    const C = useSettingsColors();
    const [innerWidth, setInnerWidth] = useState(0);
    const segWidth = options.length ? (innerWidth - SEG_GAP * (options.length - 1)) / options.length : 0;
    const pill = C.isDark ? C.segment : C.card;

    const slider = useAnimatedStyle(() => {
        if (!progress || segWidth <= 0) return { opacity: 0 };
        return { opacity: 1, width: segWidth, transform: [{ translateX: progress.value * (segWidth + SEG_GAP) }] };
    });

    return (
        <View
            style={[st.segmented, { backgroundColor: C.isDark ? C.card : C.input, borderColor: C.border }, style]}
            onLayout={progress ? e => setInnerWidth(e.nativeEvent.layout.width - SEG_PADDING * 2 - 2) : undefined}
        >
            {progress && <Animated.View pointerEvents="none" style={[st.segSlider, { backgroundColor: pill }, slider]} />}
            {options.map((opt, i) => {
                const on = opt.key === value;
                return (
                    <TouchableOpacity
                        key={opt.key}
                        onPress={() => onChange(opt.key)}
                        activeOpacity={0.7}
                        style={[st.seg, !progress && on && { backgroundColor: pill }]}
                        accessibilityRole="tab"
                        accessibilityState={{ selected: on }}
                    >
                        {opt.icon && <Ionicons name={opt.icon} size={16} color={on ? C.text : C.textSecondary} />}
                        {!!opt.label && (
                            <TabLabel label={opt.label} index={i} progress={progress} on={on} activeColor={C.text} inactiveColor={C.textSecondary} style={st.segText} />
                        )}
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

/** −/+ counter (design: .stepper). */
export function Stepper({ value, onChange, min = 0, max = 99 }: { value: number; onChange: (v: number) => void; min?: number; max?: number }) {
    const C = useSettingsColors();
    const btn = (icon: 'remove' | 'add', next: number, disabled: boolean) => (
        <TouchableOpacity
            onPress={() => onChange(next)}
            disabled={disabled}
            hitSlop={6}
            style={[st.stepBtn, { backgroundColor: icon === 'add' ? C.primary : C.input }, disabled && st.dimmed]}
            accessibilityLabel={icon === 'add' ? 'Artır' : 'Azalt'}
        >
            <Ionicons name={icon} size={16} color={icon === 'add' ? C.onPrimary : C.text} />
        </TouchableOpacity>
    );
    return (
        <View style={[st.stepper, { backgroundColor: C.iconTile }]}>
            {btn('remove', value - 1, value <= min)}
            <Text style={[st.stepVal, { color: C.text }]}>{value}</Text>
            {btn('add', value + 1, value >= max)}
        </View>
    );
}

export function TextField({ label, style, inputStyle, right, ...props }: Omit<TextInputProps, 'style'> & { label?: string; style?: StyleProp<ViewStyle>; inputStyle?: StyleProp<TextStyle>; right?: ReactNode }) {
    const C = useSettingsColors();
    return (
        <View style={style}>
            {!!label && <Text style={[st.fieldLabel, { color: C.textSecondary }]}>{label}</Text>}
            <View style={[st.field, { backgroundColor: C.input, borderColor: C.border }, props.editable === false && st.dimmed]}>
                <TextInput placeholderTextColor={C.placeholder} {...props} style={[st.fieldInput, { color: C.text }, inputStyle]} />
                {right}
            </View>
        </View>
    );
}

/** Centered empty/status layout used by full-screen states. */
export function StateView({ icon, color, title, text, children }: { icon: keyof typeof Ionicons.glyphMap; color?: string; title: string; text?: string; children?: ReactNode }) {
    const C = useSettingsColors();
    const tint = color ?? C.textSecondary;
    return (
        <View style={st.state}>
            <View style={[st.stateIcon, { backgroundColor: withOpacity(tint, 0.14), borderColor: withOpacity(tint, 0.35) }]}>
                <Ionicons name={icon} size={34} color={tint} />
            </View>
            <Text style={[st.stateTitle, { color: C.text }]}>{title}</Text>
            {!!text && <Text style={[st.stateText, { color: C.textSecondary }]}>{text}</Text>}
            {children && <View style={st.stateActions}>{children}</View>}
        </View>
    );
}

export function FinBox({ label, value, color }: { label: string; value: string; color?: string }) {
    const C = useSettingsColors();
    return (
        <View style={[st.finBox, { backgroundColor: C.card, borderColor: C.border }]}>
            <Text style={[st.finLabel, { color: C.textSecondary }]}>{label}</Text>
            <Text style={[st.finValue, { color: color ?? C.text }]}>{value}</Text>
        </View>
    );
}

export function PrimaryButton({ label, onPress, icon, disabled, loading, style }: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; disabled?: boolean; loading?: ReactNode; style?: object }) {
    const C = useSettingsColors();
    return (
        <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.85} style={[st.btn, { backgroundColor: C.primary }, disabled && st.dimmed, style]}>
            {loading ?? (
                <>
                    {icon && <Ionicons name={icon} size={18} color={C.onPrimary} />}
                    <Text style={[st.btnText, { color: C.onPrimary }]}>{label}</Text>
                </>
            )}
        </TouchableOpacity>
    );
}

export function SecondaryButton({ label, onPress, icon, color, disabled, style }: { label: string; onPress: () => void; icon?: keyof typeof Ionicons.glyphMap; color?: string; disabled?: boolean; style?: object }) {
    const C = useSettingsColors();
    const fg = color ?? C.text;
    return (
        <TouchableOpacity onPress={onPress} disabled={disabled} activeOpacity={0.8} style={[st.btn, { backgroundColor: C.card, borderColor: C.border, borderWidth: 1 }, disabled && st.dimmed, style]}>
            {icon && <Ionicons name={icon} size={18} color={fg} />}
            <Text style={[st.btnText, { color: fg }]}>{label}</Text>
        </TouchableOpacity>
    );
}

/**
 * Opaque bottom sheet on a dimmed backdrop. Rendered as an in-screen overlay rather than a native
 * Modal, so alerts and the image picker can open right after it closes (iOS drops a modal presented
 * while another is dismissing). Render it as the last child of the screen root.
 */
export function Sheet({ visible, onClose, title, children, maxHeight = '80%', modal }: {
    visible: boolean;
    onClose: () => void;
    title?: string;
    children: ReactNode;
    maxHeight?: `${number}%`;
    /** Use a native Modal — needed on tab screens, where the floating tab bar sits above in-screen overlays. */
    modal?: boolean;
}) {
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    useEffect(() => {
        if (!visible || modal) return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => { onClose(); return true; });
        return () => sub.remove();
    }, [visible, onClose, modal]);

    if (modal) {
        return (
            <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
                {visible && <Sheet visible onClose={onClose} title={title} maxHeight={maxHeight}>{children}</Sheet>}
            </Modal>
        );
    }

    if (!visible) return null;
    return (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={[StyleSheet.absoluteFill, st.layer]}>
            <Animated.View entering={FadeIn.duration(150)} style={[StyleSheet.absoluteFill, { backgroundColor: C.overlay }]}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Kapat" />
            </Animated.View>
            <View style={st.backdrop} pointerEvents="box-none">
                <Animated.View
                    entering={SlideInDown.duration(220)}
                    style={[st.sheet, { backgroundColor: C.sheet, borderColor: C.border, paddingBottom: insets.bottom + 16, maxHeight }]}
                >
                    <View style={[st.grabber, { backgroundColor: C.textTertiary }]} />
                    {title && <Text style={[st.sheetTitle, { color: C.text }]}>{title}</Text>}
                    {children}
                </Animated.View>
            </View>
        </KeyboardAvoidingView>
    );
}

export function SheetRow({ icon, label, sub, onPress, danger, right, last }: { icon: keyof typeof Ionicons.glyphMap; label: string; sub?: string; onPress: () => void; danger?: boolean; right?: ReactNode; last?: boolean }) {
    const C = useSettingsColors();
    const fg = danger ? C.error : C.text;
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.6} style={[st.sheetRow, { borderBottomColor: C.divider }, last && { borderBottomWidth: 0 }]}>
            <View style={[st.sheetIcon, { backgroundColor: danger ? withOpacity(C.error, 0.12) : C.iconTile }]}>
                <Ionicons name={icon} size={18} color={danger ? C.error : C.iconColor} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={[st.sheetRowText, { color: fg }]}>{label}</Text>
                {sub && <Text style={[st.sheetRowSub, { color: C.textSecondary }]}>{sub}</Text>}
            </View>
            {right ?? <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />}
        </TouchableOpacity>
    );
}

const st = StyleSheet.create({
    eyebrow: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.7 },
    pill: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, alignSelf: 'flex-start' },
    pillText: { fontSize: 11.5, fontWeight: '700' },

    tabStrip: { flexDirection: 'row', gap: 20, borderBottomWidth: 1, marginBottom: 16 },
    tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingBottom: 10, borderBottomWidth: 2.5, borderBottomColor: palette.transparent, marginBottom: -1 },
    tabText: { fontSize: 13.5, fontWeight: '700' },
    tabBadge: { minWidth: 16, height: 16, borderRadius: 8, paddingHorizontal: 4, alignItems: 'center', justifyContent: 'center' },
    tabBadgeText: { fontSize: 9.5, fontWeight: '800' },
    tabIndicator: { position: 'absolute', left: 0, bottom: -1, height: 2.5, borderRadius: 2 },

    segmented: { flexDirection: 'row', borderRadius: 14, borderWidth: 1, padding: 4, gap: 4 },
    seg: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 6, borderRadius: 11 },
    segText: { fontSize: 13.5, fontWeight: '700' },
    segSlider: { position: 'absolute', left: SEG_PADDING, top: SEG_PADDING, bottom: SEG_PADDING, borderRadius: 11 },

    stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, borderRadius: 12, padding: 4 },
    stepBtn: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
    stepVal: { fontSize: 15, fontWeight: '800', minWidth: 20, textAlign: 'center' },

    fieldLabel: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 7 },
    field: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, minHeight: 50, gap: 8 },
    fieldInput: { flex: 1, fontSize: 15, paddingVertical: 12 },

    state: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 8 },
    stateIcon: { width: 88, height: 88, borderRadius: 28, borderWidth: 1, alignItems: 'center', justifyContent: 'center', marginBottom: 12 },
    stateTitle: { fontSize: 22, fontWeight: '800', textAlign: 'center' },
    stateText: { fontSize: 14, lineHeight: 20, textAlign: 'center', maxWidth: 320 },
    stateActions: { alignSelf: 'stretch', gap: 10, marginTop: 20 },

    finBox: { flex: 1, borderRadius: 16, borderWidth: 1, padding: 14 },
    finLabel: { fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.3 },
    finValue: { fontSize: 19, fontWeight: '800', marginTop: 2 },

    btn: { height: 50, borderRadius: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 14 },
    btnText: { fontSize: 15, fontWeight: '700' },
    dimmed: { opacity: 0.5 },

    layer: { zIndex: 50, elevation: 50 },
    backdrop: { flex: 1, justifyContent: 'flex-end' },
    sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, borderWidth: 1, paddingHorizontal: 16, paddingTop: 10 },
    grabber: { width: 36, height: 4, borderRadius: 2, alignSelf: 'center', marginBottom: 12, opacity: 0.5 },
    sheetTitle: { fontSize: 17, fontWeight: '800', textAlign: 'center', marginBottom: 8 },
    sheetRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth },
    sheetIcon: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
    sheetRowText: { fontSize: 15, fontWeight: '600' },
    sheetRowSub: { fontSize: 12, marginTop: 2 },
});
