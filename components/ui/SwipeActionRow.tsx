import { Ionicons } from '@expo/vector-icons';
import { ReactNode } from 'react';
import { StyleSheet, Text, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    Extrapolation,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';
import { selectionHaptic } from '../../services/haptics';

/**
 * A list row with two swipe actions, driven on the UI thread:
 * swipe right → `onPrimary` (the row springs back), swipe left → `onDestructive` (the row slides out
 * and its height collapses before the callback removes it). Past the threshold the action "arms":
 * the icon pops and a light haptic confirms, so releasing is a deliberate choice.
 */

const THRESHOLD = 84;
const SPRING = { damping: 20, stiffness: 260, mass: 0.7 };

interface SwipeAction {
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
    color: string;
    onTrigger: () => void;
}

export function SwipeActionRow({ children, primary, destructive, textColor }: {
    children: ReactNode;
    primary: SwipeAction;
    destructive: SwipeAction;
    /** Icon/label color on the action backgrounds. */
    textColor: string;
}) {
    const { width } = useWindowDimensions();
    const x = useSharedValue(0);
    const armed = useSharedValue(0);
    const rowHeight = useSharedValue(0);
    const collapse = useSharedValue(1);

    // Gesture callbacks run as worklets: capture the callbacks themselves, not the action objects.
    const onPrimary = primary.onTrigger;
    const onDestructive = destructive.onTrigger;

    const pan = Gesture.Pan()
        // Horizontal intent only; vertical movement is left to the list's scroll.
        .activeOffsetX([-12, 12])
        .failOffsetY([-12, 12])
        .onUpdate(e => {
            const t = e.translationX;
            const limit = THRESHOLD * 1.5;
            // Resistance past the limit keeps the row attached to the finger without flying off.
            x.value = Math.abs(t) <= limit ? t : Math.sign(t) * (limit + (Math.abs(t) - limit) * 0.3);
            const next = x.value >= THRESHOLD ? 1 : x.value <= -THRESHOLD ? -1 : 0;
            if (next !== armed.value) {
                armed.value = next;
                if (next !== 0) runOnJS(selectionHaptic)();
            }
        })
        .onEnd(e => {
            const deleteIntent = x.value <= -THRESHOLD || (e.velocityX < -1100 && x.value < -36);
            const primaryIntent = x.value >= THRESHOLD || (e.velocityX > 1100 && x.value > 36);
            armed.value = 0;
            if (deleteIntent) {
                x.value = withTiming(-width, { duration: 170 }, slid => {
                    if (!slid) return;
                    collapse.value = withTiming(0, { duration: 180 }, collapsed => {
                        if (collapsed) runOnJS(onDestructive)();
                    });
                });
                return;
            }
            if (primaryIntent) runOnJS(onPrimary)();
            x.value = withSpring(0, { ...SPRING, velocity: e.velocityX });
        });

    const rowStyle = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

    const containerStyle = useAnimatedStyle(() => {
        // Natural height until a delete starts; then the measured height shrinks to zero.
        if (collapse.value >= 1 || rowHeight.value === 0) return { opacity: 1 };
        return { height: rowHeight.value * collapse.value, opacity: collapse.value };
    });

    // Each action fills only the strip the row has uncovered, so the row itself can stay transparent.
    const leftStyle = useAnimatedStyle(() => ({ width: Math.max(0, x.value) }));
    const rightStyle = useAnimatedStyle(() => ({ width: Math.max(0, -x.value) }));

    const leftIcon = useAnimatedStyle(() => {
        const reveal = interpolate(x.value, [24, THRESHOLD], [0, 1], Extrapolation.CLAMP);
        return { opacity: reveal, transform: [{ scale: withSpring(armed.value === 1 ? 1.15 : 0.75 + reveal * 0.25, SPRING) }] };
    });
    const rightIcon = useAnimatedStyle(() => {
        const reveal = interpolate(-x.value, [24, THRESHOLD], [0, 1], Extrapolation.CLAMP);
        return { opacity: reveal, transform: [{ scale: withSpring(armed.value === -1 ? 1.15 : 0.75 + reveal * 0.25, SPRING) }] };
    });

    const actionContent = (action: SwipeAction, style: object) => (
        <Animated.View style={[st.actionContent, style]}>
            <Ionicons name={action.icon} size={22} color={textColor} />
            <Text style={[st.actionLabel, { color: textColor }]} numberOfLines={1}>{action.label}</Text>
        </Animated.View>
    );

    return (
        <Animated.View
            style={[st.container, containerStyle]}
            onLayout={e => {
                if (collapse.get() >= 1) rowHeight.set(e.nativeEvent.layout.height);
            }}
        >
            <Animated.View style={[st.action, st.left, { backgroundColor: primary.color }, leftStyle]}>
                {actionContent(primary, leftIcon)}
            </Animated.View>
            <Animated.View style={[st.action, st.right, { backgroundColor: destructive.color }, rightStyle]}>
                {actionContent(destructive, rightIcon)}
            </Animated.View>
            <GestureDetector gesture={pan}>
                <Animated.View style={rowStyle}>{children}</Animated.View>
            </GestureDetector>
        </Animated.View>
    );
}

const st = StyleSheet.create({
    container: { overflow: 'hidden' },
    action: { position: 'absolute', top: 6, bottom: 6, borderRadius: 14, overflow: 'hidden', justifyContent: 'center' },
    left: { left: 0, alignItems: 'flex-start' },
    right: { right: 0, alignItems: 'flex-end' },
    actionContent: { width: THRESHOLD, alignItems: 'center', justifyContent: 'center' },
    actionLabel: { fontSize: 10.5, fontWeight: '700', marginTop: 3 },
});
