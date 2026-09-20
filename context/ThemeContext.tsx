import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { Appearance, ColorSchemeName, Platform, useColorScheme } from 'react-native';

type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
    theme: ColorSchemeName;
    themeMode: ThemeMode;
    setThemeMode: (mode: ThemeMode) => void;
    isDark: boolean;
    /** False until the saved preference has been read; the splash waits for it to avoid a theme flash. */
    ready: boolean;
}

const ThemeContext = createContext<ThemeContextType>({
    theme: 'light',
    themeMode: 'system',
    setThemeMode: () => { },
    isDark: false,
    ready: false,
});

export const useTheme = () => useContext(ThemeContext);

const THEME_STORAGE_KEY = '@app_theme_mode';

/** Keeps native appearance (and NativeWind's dark: classes) in sync with the chosen mode. */
const applyNativeAppearance = (mode: ThemeMode) => {
    if (Platform.OS === 'web' || !Appearance.setColorScheme) return;
    Appearance.setColorScheme(mode === 'system' ? 'unspecified' : mode);
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
    const [themeMode, setThemeModeState] = useState<ThemeMode>('system');
    const [ready, setReady] = useState(false);
    // Reactive: follows the OS in system mode and the override otherwise, so no change event can be missed.
    const scheme = useColorScheme();

    useEffect(() => {
        AsyncStorage.getItem(THEME_STORAGE_KEY)
            .then(saved => {
                if (saved === 'light' || saved === 'dark' || saved === 'system') {
                    setThemeModeState(saved);
                    applyNativeAppearance(saved);
                }
            })
            .catch(error => console.error('Error loading theme:', error))
            .finally(() => setReady(true));
    }, []);

    const setThemeMode = useCallback((mode: ThemeMode) => {
        setThemeModeState(mode);
        applyNativeAppearance(mode);
        AsyncStorage.setItem(THEME_STORAGE_KEY, mode).catch(error => console.error('Error saving theme:', error));
    }, []);

    const theme: ColorSchemeName = themeMode === 'system' ? (scheme === 'dark' ? 'dark' : 'light') : themeMode;
    const isDark = theme === 'dark';

    return (
        <ThemeContext.Provider value={{ theme, themeMode, setThemeMode, isDark, ready }}>
            {children}
        </ThemeContext.Provider>
    );
};
