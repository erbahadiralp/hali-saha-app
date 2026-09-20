import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetBackdrop, BottomSheetView } from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';
import React, { forwardRef, useCallback, useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, useColorScheme, View } from 'react-native';

export interface ActionMenuItem {
    id: string;
    title: string;
    icon: keyof typeof Ionicons.glyphMap;
    onPress: () => void;
    destructive?: boolean;
}

interface CustomBottomSheetProps {
    title?: string;
    items: ActionMenuItem[];
    onClose?: () => void;
}

export const CustomBottomSheet = forwardRef<BottomSheet, CustomBottomSheetProps>(
    ({ title, items, onClose }, ref) => {
        const colorScheme = useColorScheme();
        const isDark = colorScheme === 'dark';

        const colors = {
            text: isDark ? '#FFFFFF' : '#111827',
            icon: isDark ? '#9CA3AF' : '#6B7280',
            tint: '#10B981',
        };

        // Snap points for the bottom sheet
        const snapPoints = useMemo(() => ['40%', '50%'], []);

        // Custom backdrop to blur the background behind the sheet
        const renderBackdrop = useCallback(
            (props: any) => (
                <BottomSheetBackdrop
                    {...props}
                    disappearsOnIndex={-1}
                    appearsOnIndex={0}
                    opacity={0.7}
                />
            ),
            []
        );

        // Custom background for the sheet itself using explicit styling instead of a custom component
        // to avoid conflicts with Gorhom's internal view rendering
        const sheetBackgroundStyle = useMemo(
            () => ({
                backgroundColor: isDark ? 'rgba(30, 30, 30, 0.85)' : 'rgba(255, 255, 255, 0.85)',
                borderTopLeftRadius: 24,
                borderTopRightRadius: 24,
            }),
            [isDark]
        );

        return (
            <BottomSheet
                ref={ref}
                index={-1}
                snapPoints={snapPoints}
                enablePanDownToClose={true}
                backdropComponent={renderBackdrop}
                backgroundStyle={sheetBackgroundStyle}
                handleIndicatorStyle={{ backgroundColor: colors.icon, width: 40 }}
                onClose={onClose}
            >
                <BottomSheetView style={styles.contentContainer}>
                    {/* Add BlurView behind the content for true glassmorphism */}
                    <BlurView
                        intensity={isDark ? 50 : 80}
                        tint={isDark ? 'dark' : 'light'}
                        style={StyleSheet.absoluteFill}
                    />

                    <View style={styles.innerContainer}>
                        {title && (
                            <Text style={[styles.title, { color: colors.text }]}>
                                {title}
                            </Text>
                        )}

                        <View style={styles.itemsContainer}>
                            {items.map((item, index) => (
                                <TouchableOpacity
                                    key={item.id}
                                    style={[
                                        styles.itemButton,
                                        {
                                            borderBottomWidth: index === items.length - 1 ? 0 : StyleSheet.hairlineWidth,
                                            borderBottomColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.1)',
                                        }
                                    ]}
                                    onPress={() => {
                                        // Close sheet first, then execute action
                                        if (ref && 'current' in ref && ref.current) {
                                            ref.current.close();
                                        }
                                        setTimeout(() => item.onPress(), 100);
                                    }}
                                >
                                    <View style={[
                                        styles.iconContainer,
                                        { backgroundColor: item.destructive ? 'rgba(239, 68, 68, 0.1)' : (isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.04)') }
                                    ]}>
                                        <Ionicons
                                            name={item.icon}
                                            size={20}
                                            color={item.destructive ? '#EF4444' : colors.tint}
                                        />
                                    </View>
                                    <Text style={[
                                        styles.itemText,
                                        { color: item.destructive ? '#EF4444' : colors.text }
                                    ]}>
                                        {item.title}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </BottomSheetView>
            </BottomSheet>
        );
    }
);

const styles = StyleSheet.create({
    contentContainer: {
        flex: 1,
        overflow: 'hidden',
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
    },
    innerContainer: {
        flex: 1,
        padding: 24,
    },
    title: {
        fontSize: 18,
        fontWeight: 'bold',
        marginBottom: 20,
        textAlign: 'center',
    },
    itemsContainer: {
        borderRadius: 16,
        overflow: 'hidden',
    },
    itemButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 16,
        paddingHorizontal: 8,
    },
    iconContainer: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 16,
    },
    itemText: {
        fontSize: 16,
        fontWeight: '500',
    }
});
