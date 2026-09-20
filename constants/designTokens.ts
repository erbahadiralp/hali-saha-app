/**
 * Tek renk kaynağı: design/Renk Rehberi - Açık & Koyu Tema.png.
 * HTML referansları yalnızca yerleşim ve ölçü kaynağıdır.
 */
export const palette = {
  white: '#FFFFFF', black: '#000000', transparent: 'transparent',
  lightStart: '#F0F4F8', lightEnd: '#E2E8F0', lightSurface: '#F8FAFC',
  lightInput: '#F1F5F9', lightText: '#0F172A', lightSecondary: '#475569',
  muted: '#64748B', placeholder: '#94A3B8', green: '#16A34A',
  greenText: '#15803D', greenBright: '#22C55E', border: '#CBD5E1',
  lightAvatar: '#E0E7FF', darkStart: '#0B0F14', darkEnd: '#141A24',
  darkCanvas: '#10141D', neon: '#00FF66', darkGreen: '#1B5E20',
  darkAvatar: '#1E2746', darkSegment: '#232D42', error: '#EF4444',
  warning: '#F59E0B', darkError: '#FF3366',
};

/** Alpha is applied centrally; callers never concatenate alpha onto rgba(). */
export function withOpacity(color: string, opacity: number): string {
  const a = Math.max(0, Math.min(1, opacity));
  if (color === palette.transparent) return color;
  const rgba = color.match(/^rgba?\(([\d.]+),\s*([\d.]+),\s*([\d.]+)(?:,\s*([\d.]+))?\)$/);
  if (rgba) return 'rgba(' + rgba[1] + ', ' + rgba[2] + ', ' + rgba[3] + ', ' + (a * Number(rgba[4] ?? 1)) + ')';
  const hex = color.replace('#', '');
  const full = hex.length === 3 ? hex.split('').map(c => c + c).join('') : hex;
  return 'rgba(' + parseInt(full.slice(0, 2), 16) + ', ' + parseInt(full.slice(2, 4), 16) + ', ' + parseInt(full.slice(4, 6), 16) + ', ' + a + ')';
}

const shared = {
  onPrimary: palette.white, textTertiary: palette.muted, placeholder: palette.placeholder,
  warning: palette.warning, success: palette.greenBright,
  // Roles absent from the guide reuse its palette rather than importing HTML colors.
  info: palette.muted, gold: palette.warning, teamA: palette.placeholder,
  teamB: palette.darkError, overlay: withOpacity(palette.black, 0.6),
  shadow: palette.black, transparent: palette.transparent,
};
export const themes = {
  light: {
    ...shared, background: palette.lightStart,
    gradient: [palette.lightStart, palette.lightEnd] as const,
    canvas: palette.lightStart, card: palette.white, surface: palette.lightSurface,
    input: palette.lightInput, text: palette.lightText, textSecondary: palette.lightSecondary,
    primary: palette.green, primaryText: palette.greenText, accent: palette.greenBright,
    border: palette.border, divider: palette.lightEnd, avatar: palette.lightAvatar,
    segment: palette.border, nav: palette.white, error: palette.error,
  },
  dark: {
    ...shared, background: palette.darkStart,
    gradient: [palette.darkStart, palette.darkEnd] as const,
    canvas: palette.darkCanvas, card: withOpacity(palette.white, 0.04),
    surface: withOpacity(palette.white, 0.04), input: withOpacity(palette.white, 0.04),
    text: palette.white, textSecondary: palette.placeholder,
    primary: palette.darkGreen, primaryText: palette.neon, accent: palette.neon,
    border: withOpacity(palette.white, 0.07), divider: withOpacity(palette.white, 0.07),
    avatar: palette.darkAvatar, segment: palette.darkSegment,
    nav: withOpacity(palette.white, 0.06), error: palette.darkError,
  },
};
export type DesignTheme = typeof themes.light | typeof themes.dark;
export const getThemeColors = (isDark: boolean): DesignTheme => isDark ? themes.dark : themes.light;

// Compatibility names for existing shared components. All values derive from the guide.
export const colors = {
  primary: palette.green, primaryDark: palette.darkGreen, accentDark: palette.neon,
  backgroundDark: palette.darkStart, backgroundLight: palette.lightStart,
  cardDark: themes.dark.card, cardLight: palette.white,
  textDark: palette.white, textLight: palette.lightText,
  textSecondaryDark: palette.placeholder, textSecondaryLight: palette.lightSecondary,
  success: palette.greenBright, error: palette.error, warning: palette.warning,
  info: palette.muted, gold: palette.warning, borderDark: themes.dark.border,
  borderLight: palette.border, glassBorderDark: themes.dark.border,
  white: palette.white, black: palette.black, transparent: palette.transparent,
};

// Spacing (consistent padding/margin values)
export const spacing = {
    xs: 4,
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    xxl: 24,
    xxxl: 32,
};

// Border Radius (consistent rounded corners)
export const borderRadius = {
    sm: 8,
    md: 12,
    lg: 16,
    xl: 20,
    full: 9999,
};

// Shadows (consistent elevation)
export const shadows = {
    sm: {
        shadowColor: palette.black,
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.1,
        shadowRadius: 2,
        elevation: 2,
    },
    md: {
        shadowColor: palette.black,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.15,
        shadowRadius: 4,
        elevation: 4,
    },
    lg: {
        shadowColor: palette.black,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.2,
        shadowRadius: 8,
        elevation: 8,
    },
    glow: (color: string) => ({
        shadowColor: color,
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.8,
        shadowRadius: 10,
        elevation: 8,
    }),
};

// Touch targets (minimum 44px for accessibility)
export const touchTargets = {
    minimum: 44,
    comfortable: 48,
};

// Typography
export const typography = {
    heading: {
        fontSize: 24,
        fontWeight: 'bold' as const,
    },
    subheading: {
        fontSize: 18,
        fontWeight: '600' as const,
    },
    body: {
        fontSize: 16,
        fontWeight: 'normal' as const,
    },
    caption: {
        fontSize: 14,
        fontWeight: 'normal' as const,
    },
    small: {
        fontSize: 12,
        fontWeight: 'normal' as const,
    },
};

// Input styles
export const inputStyles = {
    base: (isDark: boolean) => ({
        backgroundColor: getThemeColors(isDark).input,
        borderRadius: borderRadius.md,
        padding: spacing.lg,
        fontSize: 16,
        color: isDark ? colors.textDark : colors.textLight,
        minHeight: touchTargets.minimum,
    }),
    placeholder: (isDark: boolean) => ({
        color: getThemeColors(isDark).placeholder,
    }),
};

// Button styles
export const buttonStyles = {
    primary: (isDark: boolean) => ({
        backgroundColor: getThemeColors(isDark).primary,
        borderRadius: borderRadius.md,
        padding: spacing.lg,
        minHeight: touchTargets.minimum,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    }),
    secondary: (isDark: boolean) => ({
        backgroundColor: isDark ? colors.cardDark : colors.cardLight,
        borderRadius: borderRadius.md,
        padding: spacing.lg,
        minHeight: touchTargets.minimum,
        borderWidth: 1,
        borderColor: isDark ? colors.borderDark : colors.borderLight,
        alignItems: 'center' as const,
        justifyContent: 'center' as const,
    }),
    disabled: {
        opacity: 0.5,
    },
};

// Card styles
export const cardStyles = {
    base: (isDark: boolean) => ({
        backgroundColor: isDark ? colors.cardDark : colors.cardLight,
        borderRadius: borderRadius.lg,
        padding: spacing.lg,
        ...shadows.md,
    }),
};

export const utilityRoles = { content: 'text', secondary: 'textSecondary', muted: 'textTertiary', primary: 'primary', accent: 'primaryText', card: 'card', surface: 'surface', input: 'input', canvas: 'background', line: 'border', avatar: 'avatar', danger: 'error', warning: 'warning', 'on-primary': 'onPrimary', scrim: 'shadow' } as const;
export const utilityOpacities = [0, 3, 4, 5, 6, 7, 8, 10, 12, 15, 20, 25, 30, 40, 50, 60, 70, 75, 80, 85, 90, 95, 100] as const;
