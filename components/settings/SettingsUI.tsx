import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import React, { ReactNode, useEffect, useRef, useState } from 'react';
import {
    Animated,
    Modal,
    Pressable,
    StyleSheet,
    Text,
    TouchableOpacity,
    TouchableWithoutFeedback,
    View,
    useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getThemeColors, palette, withOpacity } from '../../constants/designTokens';
import { useTheme } from '../../context/ThemeContext';

/**
 * Shared building blocks for settings screens.
 * Layout follows design/tasarım (Ayarlar & Bildirim Ayarları); colors come only from designTokens.
 */
export function useSettingsColors() {
    const { isDark } = useTheme();
    const T = getThemeColors(isDark);
    return {
        ...T,
        isDark,
        // Rows sit directly on the background, so icon tiles need their own fill.
        iconTile: isDark ? T.segment : T.card,
        iconColor: T.textSecondary,
        // Floating layers (menus, modals) must be opaque; the dark card token is translucent glass.
        sheet: isDark ? palette.darkEnd : palette.white,
        toggleOff: isDark ? T.segment : T.border,
        link: isDark ? palette.greenBright : palette.greenText,
    };
}

export type SettingsColors = ReturnType<typeof useSettingsColors>;

export function SettingsScreen({ title, onTitlePress, onBack, headerRight, children }: {
    title: string;
    onTitlePress?: () => void;
    /** Overrides the default router.back(), e.g. to leave an in-screen detail view. */
    onBack?: () => void;
    headerRight?: ReactNode;
    children: ReactNode;
}) {
    const C = useSettingsColors();
    const router = useRouter();
    const insets = useSafeAreaInsets();

    return (
        <View style={{ flex: 1, backgroundColor: C.background }}>
            <LinearGradient colors={[C.gradient[0], C.gradient[1]]} style={StyleSheet.absoluteFill} />
            <View style={[st.header, { paddingTop: insets.top + 8 }]}>
                <TouchableOpacity onPress={onBack ?? (() => router.back())} hitSlop={12} accessibilityLabel="Geri">
                    <Ionicons name="chevron-back" size={24} color={C.text} />
                </TouchableOpacity>
                <TouchableWithoutFeedback onPress={onTitlePress}>
                    <Text style={[st.headerTitle, { color: C.text }]}>{title}</Text>
                </TouchableWithoutFeedback>
                {headerRight ? <View style={st.headerRight}>{headerRight}</View> : null}
            </View>
            {children}
        </View>
    );
}

export function SectionLabel({ children, style }: { children: ReactNode; style?: object }) {
    const C = useSettingsColors();
    return <Text style={[st.sectionLabel, { color: C.textTertiary }, style]}>{children}</Text>;
}

interface SettingsRowProps {
    icon?: keyof typeof Ionicons.glyphMap;
    label: string;
    value?: string;
    right?: ReactNode;
    onPress?: () => void;
    last?: boolean;
    danger?: boolean;
    chevron?: boolean;
    disabled?: boolean;
}

export const SettingsRow = React.forwardRef<View, SettingsRowProps>(
    ({ icon, label, value, right, onPress, last, danger, chevron = !!onPress, disabled }, ref) => {
        const C = useSettingsColors();
        const content = (
            <View
                ref={ref}
                collapsable={false}
                style={[st.row, { borderBottomColor: C.divider }, last && st.rowLast, disabled && st.disabled]}
            >
                {icon && (
                    <View style={[st.iconTile, { backgroundColor: C.iconTile }]}>
                        <Ionicons name={icon} size={17} color={danger ? C.error : C.iconColor} />
                    </View>
                )}
                <Text style={[st.rowLabel, { color: danger ? C.error : C.text }]} numberOfLines={1}>{label}</Text>
                {value ? <Text style={[st.rowValue, { color: C.textSecondary }]}>{value}</Text> : null}
                {right}
                {chevron && <Ionicons name="chevron-forward" size={18} color={C.textTertiary} />}
            </View>
        );
        if (!onPress) return content;
        return (
            <TouchableOpacity onPress={onPress} activeOpacity={0.6} disabled={disabled}>
                {content}
            </TouchableOpacity>
        );
    }
);
SettingsRow.displayName = 'SettingsRow';

export function Toggle({ value, onValueChange, disabled }: { value: boolean; onValueChange: (v: boolean) => void; disabled?: boolean }) {
    const C = useSettingsColors();
    const anim = useRef(new Animated.Value(value ? 1 : 0)).current;

    useEffect(() => {
        Animated.timing(anim, { toValue: value ? 1 : 0, duration: 160, useNativeDriver: true }).start();
    }, [value, anim]);

    // Dimming is left to the containing SettingsRow so disabled rows don't fade twice.
    return (
        <Pressable
            onPress={() => onValueChange(!value)}
            disabled={disabled}
            hitSlop={8}
            accessibilityRole="switch"
            accessibilityState={{ checked: value, disabled }}
            style={[st.toggle, { backgroundColor: value ? C.primary : C.toggleOff }]}
        >
            <Animated.View
                style={[
                    st.knob,
                    { backgroundColor: palette.white, shadowColor: C.shadow },
                    { transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [0, 18] }) }] },
                ]}
            />
        </Pressable>
    );
}

export interface MenuOption<T extends string> {
    value: T;
    label: string;
    icon?: keyof typeof Ionicons.glyphMap;
}

/** Small popover menu anchored under (or above, if there is no room) the pressed row. */
export function useAnchoredMenu() {
    const anchorRef = useRef<View>(null);
    const [anchor, setAnchor] = useState<{ y: number; height: number } | null>(null);

    const open = () => {
        anchorRef.current?.measureInWindow((_x, y, _w, height) => setAnchor({ y, height }));
    };
    const close = () => setAnchor(null);

    return { anchorRef, anchor, open, close };
}

export function AnchoredMenu<T extends string>({
    anchor,
    options,
    selected,
    onSelect,
    onClose,
    fullWidth,
}: {
    anchor: { y: number; height: number } | null;
    options: MenuOption<T>[];
    selected?: T;
    onSelect: (value: T) => void;
    onClose: () => void;
    /** Match the width of a full-width form field instead of a compact right-aligned popover. */
    fullWidth?: boolean;
}) {
    const C = useSettingsColors();
    const { height: screenH } = useWindowDimensions();
    const menuH = options.length * 48 + 12;
    const below = anchor ? anchor.y + anchor.height + menuH + 24 < screenH : true;
    const top = anchor ? (below ? anchor.y + anchor.height + 4 : anchor.y - menuH - 4) : 0;

    // Translucent bars keep the modal in the same coordinate space as measureInWindow (edge-to-edge).
    return (
        <Modal visible={!!anchor} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
            <Pressable style={[StyleSheet.absoluteFill, { backgroundColor: withOpacity(palette.black, C.isDark ? 0.35 : 0.12) }]} onPress={onClose} />
            <View
                style={[
                    st.menu,
                    fullWidth && st.menuFull,
                    { top, backgroundColor: C.sheet, borderColor: C.border, shadowColor: C.shadow },
                ]}
            >
                {options.map((opt) => {
                    const active = opt.value === selected;
                    return (
                        <TouchableOpacity
                            key={opt.value}
                            style={[st.menuItem, active && { backgroundColor: withOpacity(C.accent, 0.1) }]}
                            onPress={() => { onSelect(opt.value); onClose(); }}
                            activeOpacity={0.6}
                        >
                            {opt.icon && <Ionicons name={opt.icon} size={18} color={active ? C.link : C.textSecondary} />}
                            <Text style={[st.menuLabel, { color: active ? C.link : C.text }]}>{opt.label}</Text>
                            {active && <Ionicons name="checkmark" size={18} color={C.link} />}
                        </TouchableOpacity>
                    );
                })}
            </View>
        </Modal>
    );
}

const st = StyleSheet.create({
    header: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        paddingHorizontal: 16,
        paddingBottom: 12,
    },
    headerTitle: {
        flex: 1,
        fontSize: 22,
        fontWeight: '800',
        letterSpacing: -0.4,
    },
    headerRight: {
        marginLeft: 'auto',
    },
    sectionLabel: {
        fontSize: 12,
        fontWeight: '800',
        textTransform: 'uppercase',
        letterSpacing: 0.7,
        marginTop: 22,
        marginBottom: 6,
        marginLeft: 4,
    },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingVertical: 13,
        paddingHorizontal: 4,
        borderBottomWidth: StyleSheet.hairlineWidth,
        minHeight: 56,
    },
    rowLast: {
        borderBottomWidth: 0,
    },
    iconTile: {
        width: 34,
        height: 34,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
    },
    rowLabel: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
    },
    rowValue: {
        fontSize: 13,
        fontWeight: '500',
    },
    disabled: {
        opacity: 0.45,
    },
    toggle: {
        width: 44,
        height: 26,
        borderRadius: 13,
        padding: 3,
        justifyContent: 'center',
    },
    knob: {
        width: 20,
        height: 20,
        borderRadius: 10,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.2,
        shadowRadius: 2,
        elevation: 2,
    },
    menu: {
        position: 'absolute',
        right: 16,
        width: 210,
        borderRadius: 16,
        borderWidth: 1,
        padding: 6,
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.18,
        shadowRadius: 24,
        elevation: 10,
    },
    menuFull: {
        left: 16,
        width: undefined,
    },
    menuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        height: 48,
        paddingHorizontal: 12,
        borderRadius: 11,
    },
    menuLabel: {
        flex: 1,
        fontSize: 15,
        fontWeight: '600',
    },
});
