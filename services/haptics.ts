import * as Haptics from 'expo-haptics';
import { Platform } from 'react-native';

/**
 * Light haptic feedback - for subtle UI interactions
 * Like selecting items, toggles, etc.
 */
export function lightHaptic(): void {
    if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
}

/**
 * Medium haptic feedback - for standard button presses
 * Like action buttons, navigation, etc.
 */
export function mediumHaptic(): void {
    if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    }
}

/**
 * Heavy haptic feedback - for significant actions
 * Like confirming important actions, completing tasks, etc.
 */
export function heavyHaptic(): void {
    if (Platform.OS !== 'web') {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    }
}

/**
 * Success haptic feedback - for successful operations
 * Like form submission, successful login, etc.
 */
export function successHaptic(): void {
    if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }
}

/**
 * Error haptic feedback - for error states
 * Like validation errors, failed operations, etc.
 */
export function errorHaptic(): void {
    if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
}

/**
 * Warning haptic feedback - for warning states
 * Like confirmation dialogs, important notices, etc.
 */
export function warningHaptic(): void {
    if (Platform.OS !== 'web') {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    }
}

/**
 * Selection haptic feedback - for UI selections
 * Like picker selections, slider changes, etc.
 */
export function selectionHaptic(): void {
    if (Platform.OS !== 'web') {
        Haptics.selectionAsync();
    }
}
