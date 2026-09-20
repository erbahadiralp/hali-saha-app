import React, { useCallback, useEffect, useState } from 'react';
import { Dimensions, ScrollView, StyleSheet, View, useColorScheme } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from 'react-native-reanimated';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface SwipeableBottomSheetProps {
    visible: boolean;
    onClose: () => void;
    children: React.ReactNode;
    /** Maximum height as percentage of screen (0.3 to 0.9), default 0.7 */
    maxHeight?: number;
    /** Z-index for stacking order when multiple sheets are open, default 100 */
    zIndex?: number;
}

export default function SwipeableBottomSheet({
    visible,
    onClose,
    children,
    maxHeight = 0.7,
    zIndex = 100,
}: SwipeableBottomSheetProps) {
    const colorScheme = useColorScheme();
    const isDark = colorScheme === 'dark';

    // Internal render state - keeps component mounted during close animation
    const [shouldRender, setShouldRender] = useState(false);

    const translateY = useSharedValue(SCREEN_HEIGHT);
    const context = useSharedValue({ y: 0 });
    const active = useSharedValue(false);

    const MAX_TRANSLATE_Y = -SCREEN_HEIGHT * maxHeight;
    const DISMISS_THRESHOLD = -SCREEN_HEIGHT * 0.2;

    const scrollTo = useCallback((destination: number) => {
        'worklet';
        translateY.value = withSpring(destination, { damping: 50, stiffness: 400 });
    }, []);

    const handleAnimationEnd = useCallback(() => {
        setShouldRender(false);
    }, []);

    useEffect(() => {
        if (visible) {
            setShouldRender(true);
            active.value = true;
            // Use higher damping to prevent overshoot/bounce
            translateY.value = withSpring(MAX_TRANSLATE_Y, { damping: 80, stiffness: 400, overshootClamping: true });
        } else if (shouldRender) {
            // Animate out, then unmount
            translateY.value = withTiming(SCREEN_HEIGHT, { duration: 300 }, (finished) => {
                if (finished) {
                    active.value = false;
                    runOnJS(handleAnimationEnd)();
                }
            });
        }
    }, [visible, MAX_TRANSLATE_Y]);

    // Gesture only for the drag handle area
    const gesture = Gesture.Pan()
        .onStart(() => {
            context.value = { y: translateY.value };
        })
        .onUpdate((event) => {
            translateY.value = Math.max(
                MAX_TRANSLATE_Y,
                context.value.y + event.translationY
            );
        })
        .onEnd((event) => {
            if (translateY.value > DISMISS_THRESHOLD || event.velocityY > 500) {
                translateY.value = withTiming(SCREEN_HEIGHT, { duration: 300 }, (finished) => {
                    if (finished) {
                        active.value = false;
                        runOnJS(handleAnimationEnd)();
                    }
                });
                runOnJS(onClose)();
            } else {
                scrollTo(MAX_TRANSLATE_Y);
            }
        });

    const rBottomSheetStyle = useAnimatedStyle(() => {
        return {
            transform: [{ translateY: translateY.value }],
        };
    });

    const rBackdropStyle = useAnimatedStyle(() => {
        const opacity = active.value ? withTiming(1, { duration: 200 }) : withTiming(0, { duration: 200 });
        return {
            opacity,
            pointerEvents: active.value ? 'auto' : 'none',
        };
    });

    const handleBackdropPress = useCallback(() => {
        onClose();
    }, [onClose]);

    if (!shouldRender) {
        return null;
    }

    return (
        <View style={[StyleSheet.absoluteFill, { zIndex }]} pointerEvents="box-none">
            {/* Backdrop */}
            <Animated.View
                style={[
                    styles.backdrop,
                    rBackdropStyle,
                ]}
                onTouchEnd={handleBackdropPress}
            />

            {/* Bottom Sheet */}
            <Animated.View
                style={[
                    styles.bottomSheetContainer,
                    { backgroundColor: isDark ? '#161817' : 'white' },
                    rBottomSheetStyle,
                ]}
            >
                {/* Drag Handle - Only this area responds to pan gesture */}
                <GestureDetector gesture={gesture}>
                    <Animated.View style={styles.handleContainer}>
                        <View style={[
                            styles.handle,
                            { backgroundColor: isDark ? 'rgba(255,255,255,0.2)' : '#d1d5db' }
                        ]} />
                    </Animated.View>
                </GestureDetector>

                {/* Content - ScrollView handles its own scroll natively */}
                <ScrollView
                    style={styles.content}
                    showsVerticalScrollIndicator={false}
                    bounces={false}
                    nestedScrollEnabled
                >
                    {children}
                </ScrollView>
            </Animated.View>
        </View>
    );
}

const styles = StyleSheet.create({
    backdrop: {
        ...StyleSheet.absoluteFill,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
    },
    bottomSheetContainer: {
        height: SCREEN_HEIGHT,
        width: '100%',
        position: 'absolute',
        top: SCREEN_HEIGHT,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.25,
        shadowRadius: 4,
        elevation: 5,
    },
    handleContainer: {
        alignItems: 'center',
        paddingVertical: 12,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
    },
    content: {
        flex: 1,
        paddingHorizontal: 24,
        paddingBottom: 24,
    },
});
