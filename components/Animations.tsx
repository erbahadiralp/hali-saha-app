import React, { useEffect } from 'react';
import { Pressable, StyleSheet, ViewStyle } from 'react-native';
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming,
} from 'react-native-reanimated';

interface FadeInViewProps {
    children: React.ReactNode;
    delay?: number;
    duration?: number;
    style?: ViewStyle;
}

/**
 * Fade-in animation wrapper for list items
 */
export function FadeInView({
    children,
    delay = 0,
    duration = 300,
    style
}: FadeInViewProps) {
    const opacity = useSharedValue(0);
    const translateY = useSharedValue(10);

    useEffect(() => {
        opacity.value = withDelay(delay, withTiming(1, { duration }));
        translateY.value = withDelay(delay, withTiming(0, { duration }));
    }, []);

    const animatedStyle = useAnimatedStyle(() => ({
        opacity: opacity.value,
        transform: [{ translateY: translateY.value }],
    }));

    return (
        <Animated.View style={[style, animatedStyle]}>
            {children}
        </Animated.View>
    );
}

interface AnimatedListItemProps {
    children: React.ReactNode;
    index: number;
    style?: ViewStyle;
}

/**
 * Animated list item with staggered fade-in
 */
export function AnimatedListItem({
    children,
    index,
    style
}: AnimatedListItemProps) {
    // Stagger delay based on index (max 500ms to avoid too long delays)
    const delay = Math.min(index * 50, 500);

    return (
        <FadeInView delay={delay} style={style}>
            {children}
        </FadeInView>
    );
}

interface ScaleOnPressProps {
    children: React.ReactNode;
    onPress: () => void;
    style?: ViewStyle;
}

/**
 * Scale animation on press for interactive elements
 * Wraps children in a Pressable with scale animation
 */
export function ScaleOnPress({
    children,
    onPress,
    style
}: ScaleOnPressProps) {
    const scale = useSharedValue(1);

    const animatedStyle = useAnimatedStyle(() => ({
        transform: [{ scale: scale.value }],
    }));

    const handlePressIn = () => {
        scale.value = withTiming(0.95, { duration: 100 });
    };

    const handlePressOut = () => {
        scale.value = withTiming(1, { duration: 100 });
    };

    return (
        <Pressable
            onPress={onPress}
            onPressIn={handlePressIn}
            onPressOut={handlePressOut}
        >
            <Animated.View style={[style, animatedStyle]}>
                {children}
            </Animated.View>
        </Pressable>
    );
}

const styles = StyleSheet.create({});

