import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { LayoutChangeEvent, StyleProp, View, ViewStyle } from 'react-native';
import Animated, {
    Extrapolation,
    SharedValue,
    interpolate,
    runOnJS,
    useAnimatedRef,
    useAnimatedScrollHandler,
    useAnimatedStyle,
    useSharedValue,
} from 'react-native-reanimated';

/**
 * Horizontally swipeable tab pages. `progress` follows the finger (0 … pages-1) on the UI thread so tab
 * indicators can slide with it; `onIndexChange` fires when a swipe settles. Changing `index` from the
 * outside (a tab tap) scrolls to that page.
 *
 * `autoHeight` is for pagers inside a vertical ScrollView: the pager's height morphs between the
 * measured page heights while swiping instead of always taking the tallest page.
 */
export function SwipePager({ index, onIndexChange, progress, pages, autoHeight, style }: {
    index: number;
    onIndexChange: (index: number) => void;
    progress: SharedValue<number>;
    pages: ReactNode[];
    autoHeight?: boolean;
    style?: StyleProp<ViewStyle>;
}) {
    const scrollRef = useAnimatedRef<Animated.ScrollView>();
    const [size, setSize] = useState({ width: 0, height: 0 });
    const pageWidth = useSharedValue(0);
    const heights = useSharedValue<number[]>([]);
    const positioned = useRef(false);

    // runOnJS needs a stable function; the latest callback is read at call time.
    const onIndexChangeRef = useRef(onIndexChange);
    useEffect(() => {
        onIndexChangeRef.current = onIndexChange;
    }, [onIndexChange]);
    const settle = useCallback((next: number) => onIndexChangeRef.current(next), []);

    const onLayout = (e: LayoutChangeEvent) => {
        const { width, height } = e.nativeEvent.layout;
        if (width !== size.width || (!autoHeight && height !== size.height)) {
            pageWidth.set(width);
            setSize({ width, height });
        }
    };

    // Follow external index changes (tab taps); the first positioning after layout is instant.
    useEffect(() => {
        if (!size.width) return;
        const target = index * size.width;
        if (!positioned.current) {
            positioned.current = true;
            scrollRef.current?.scrollTo({ x: target, animated: false });
            progress.set(index);
            return;
        }
        if (Math.abs(progress.get() - index) > 0.001) {
            scrollRef.current?.scrollTo({ x: target, animated: true });
        }
    }, [index, size.width, progress, scrollRef]);

    const onScroll = useAnimatedScrollHandler({
        onScroll: e => {
            if (pageWidth.get() > 0) progress.set(e.contentOffset.x / pageWidth.get());
        },
        onMomentumEnd: e => {
            if (pageWidth.get() > 0) runOnJS(settle)(Math.round(e.contentOffset.x / pageWidth.get()));
        },
    });

    const setPageHeight = (i: number, height: number) => {
        const current = heights.get();
        const next = pages.map((_, k) => current[k] ?? 0);
        if (Math.abs((next[i] ?? 0) - height) < 1) return;
        next[i] = height;
        heights.set(next);
    };

    // Worklets copy everything they capture to the UI thread; React elements can't be copied, so only
    // the page count (a plain number) is used inside the animated style.
    const pageCount = pages.length;
    const heightStyle = useAnimatedStyle(() => {
        const h = heights.value;
        if (!autoHeight || h.length !== pageCount) return {};
        // Plain loops only: React Compiler hoists inline callbacks (e.g. `v => v <= 0`) out of the
        // worklet into regular JS functions, which the UI thread cannot call.
        const input: number[] = [];
        for (let i = 0; i < h.length; i++) {
            if (!(h[i] > 0)) return {};
            input.push(i);
        }
        if (h.length === 1) return { height: h[0] };
        return { height: interpolate(progress.value, input, h, Extrapolation.CLAMP) };
    });

    return (
        <View style={[autoHeight ? null : { flex: 1 }, style]} onLayout={onLayout}>
            {size.width > 0 && (
                <Animated.ScrollView
                    ref={scrollRef}
                    horizontal
                    pagingEnabled
                    bounces={false}
                    overScrollMode="never"
                    showsHorizontalScrollIndicator={false}
                    scrollEventThrottle={16}
                    onScroll={onScroll}
                    style={autoHeight ? [{ overflow: 'hidden' }, heightStyle] : { flex: 1 }}
                    contentContainerStyle={{ alignItems: 'flex-start' }}
                >
                    {pages.map((page, i) => (
                        <View
                            key={i}
                            style={autoHeight ? { width: size.width } : { width: size.width, height: size.height }}
                            onLayout={autoHeight ? e => setPageHeight(i, e.nativeEvent.layout.height) : undefined}
                        >
                            {page}
                        </View>
                    ))}
                </Animated.ScrollView>
            )}
        </View>
    );
}
