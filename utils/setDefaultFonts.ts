/**
 * Global Font Override — Barlow
 *
 * Patches React Native's Text and TextInput so that every component
 * automatically uses the correct Barlow variant based on its fontWeight.
 *
 * Call setDefaultFonts() once, AFTER fonts are loaded via useFonts().
 */
import { StyleSheet, Text, TextInput } from 'react-native';

const WEIGHT_TO_BARLOW: Record<string, string> = {
    'normal': 'Barlow_400Regular',
    '400': 'Barlow_400Regular',
    '500': 'Barlow_500Medium',
    '600': 'Barlow_600SemiBold',
    'bold': 'Barlow_700Bold',
    '700': 'Barlow_700Bold',
    '800': 'Barlow_800ExtraBold',
    '900': 'Barlow_800ExtraBold',
};

const WEIGHT_TO_BARLOW_CONDENSED: Record<string, string> = {
    'normal': 'BarlowCondensed_400Regular',
    '400': 'BarlowCondensed_400Regular',
    '600': 'BarlowCondensed_600SemiBold',
    'bold': 'BarlowCondensed_700Bold',
    '700': 'BarlowCondensed_700Bold',
};

/**
 * Given a style, resolves the correct Barlow fontFamily for the fontWeight.
 */
function resolveBarlowFamily(style: any): string {
    if (!style) return 'Barlow_400Regular';

    const flat = StyleSheet.flatten(style);
    if (!flat) return 'Barlow_400Regular';

    // If a Barlow family is already explicitly set, don't override
    const existingFamily = (flat as any).fontFamily;
    if (existingFamily && typeof existingFamily === 'string') {
        if (existingFamily.startsWith('Barlow')) return existingFamily;
        // Don't override system fonts like MaterialIcons
        if (existingFamily !== 'System' && existingFamily !== 'Roboto' && existingFamily !== 'Helvetica') {
            return existingFamily;
        }
    }

    const weight = String((flat as any).fontWeight || '400');
    return WEIGHT_TO_BARLOW[weight] || 'Barlow_400Regular';
}

let _isPatched = false;

export function setDefaultFonts(): void {
    if (_isPatched) return;
    _isPatched = true;

    // ─── Patch Text ─────────────────────────────────────────
    const origTextRender = (Text as any).render;
    if (origTextRender) {
        (Text as any).render = function (props: any, ref: any) {
            const fontFamily = resolveBarlowFamily(props.style);
            const patchedProps = {
                ...props,
                style: [{ fontFamily }, props.style],
            };
            return origTextRender.call(this, patchedProps, ref);
        };
    }

    // ─── Patch TextInput ────────────────────────────────────
    const origInputRender = (TextInput as any).render;
    if (origInputRender) {
        (TextInput as any).render = function (props: any, ref: any) {
            const fontFamily = resolveBarlowFamily(props.style);
            const patchedProps = {
                ...props,
                style: [{ fontFamily }, props.style],
            };
            return origInputRender.call(this, patchedProps, ref);
        };
    }
}

/**
 * Export font family constants for manual use (e.g. headings, special text)
 */
export const FONTS = {
    regular: 'Barlow_400Regular',
    medium: 'Barlow_500Medium',
    semibold: 'Barlow_600SemiBold',
    bold: 'Barlow_700Bold',
    extraBold: 'Barlow_800ExtraBold',
    condensedRegular: 'BarlowCondensed_400Regular',
    condensedSemibold: 'BarlowCondensed_600SemiBold',
    condensedBold: 'BarlowCondensed_700Bold',
} as const;
