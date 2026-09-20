import { Barlow_400Regular, Barlow_500Medium, Barlow_600SemiBold, Barlow_700Bold, Barlow_800ExtraBold } from '@expo-google-fonts/barlow';
import { BarlowCondensed_400Regular, BarlowCondensed_600SemiBold, BarlowCondensed_700Bold } from '@expo-google-fonts/barlow-condensed';
import { useFonts } from 'expo-font';
import { Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Platform, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AccountRecoveryScreen from '../components/AccountRecoveryScreen';
import OnboardingScreen from '../components/OnboardingScreen';
import { AuthProvider, useAuth } from '../context/AuthContext';
import { PremiumProvider } from '../context/PremiumContext';
import { ThemeProvider, useTheme } from '../context/ThemeContext';
import "../global.css";
import { initLogging } from '../services/logging';
import { ensureUserProfile, needsOnboarding } from '../services/onboardingService';
import { setDefaultFonts } from '../utils/setDefaultFonts';

export const unstable_settings = {
  anchor: '(tabs)',
};

function RootLayoutNav() {
  const { user, loading } = useAuth();
  const { isDark } = useTheme();
  const router = useRouter();
  const segments = useSegments();
  // Onboarding state is keyed by uid, so switching accounts can never show another user's result.
  const [onboardingCheck, setOnboardingCheck] = useState<{ uid: string; profile: any; needed: boolean; deleted: boolean } | null>(null);
  const checkingOnboarding = !!user && !loading && onboardingCheck?.uid !== user.uid;
  const checkedThisUser = !!user && onboardingCheck?.uid === user.uid;
  // An account with a pending deletion must choose restore or sign out before anything else.
  const showRecovery = checkedThisUser && !!onboardingCheck?.deleted;
  const showOnboarding = checkedThisUser && !showRecovery && !!onboardingCheck?.needed;

  // Every signed-in account (e-posta, Google, Apple) gets a profile document and, until it has a
  // username, the same onboarding flow.
  useEffect(() => {
    if (!user || loading) return;
    let cancelled = false;
    initLogging();
    const uid = user.uid;
    ensureUserProfile(user)
      .then(profile => {
        if (!cancelled) setOnboardingCheck({ uid, profile, needed: needsOnboarding(profile), deleted: profile?.isDeleted === true });
      })
      .catch(error => {
        console.log('Error checking onboarding:', error);
        // Don't lock the user out of the app if the check itself fails.
        if (!cancelled) setOnboardingCheck({ uid, profile: null, needed: false, deleted: false });
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, loading]);

  useEffect(() => {
    if (loading || checkingOnboarding || showOnboarding || showRecovery) return;

    const inAuthGroup = segments[0] === 'auth';

    // Delay navigation to ensure Stack is mounted
    const timeoutId = setTimeout(() => {
      if (!user && !inAuthGroup) {
        // Signed-out users land on the welcome screen; "Hemen Başla" continues to login.
        router.replace('/auth/welcome');
      } else if (user && inAuthGroup) {
        router.replace('/');
      }
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [user, loading, segments, checkingOnboarding, showOnboarding, showRecovery]);

  // Show loading while checking auth — AnimatedSplash handles this now
  if (loading || checkingOnboarding) {
    return null; // AnimatedSplash overlay covers this
  }

  if (showRecovery && user) {
    return (
      <AccountRecoveryScreen
        profile={onboardingCheck?.profile}
        onRestored={() => setOnboardingCheck(prev => (prev ? { ...prev, deleted: false, profile: { ...prev.profile, isDeleted: false } } : prev))}
      />
    );
  }

  // Show onboarding for new users after first login
  if (showOnboarding && user) {
    return (
      <OnboardingScreen
        initialProfile={onboardingCheck?.profile}
        onComplete={() => setOnboardingCheck(prev => (prev ? { ...prev, needed: false } : prev))}
      />
    );
  }

  return (
    <>
      {/* Screens left in the back stack stop re-rendering while hidden. */}
      <Stack screenOptions={{ headerShown: false, freezeOnBlur: true }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="auth/welcome" options={{ headerShown: false }} />
        <Stack.Screen name="auth/login" options={{ headerShown: false }} />
        <Stack.Screen name="auth/register" options={{ headerShown: false }} />
        <Stack.Screen name="auth/forgot-password" options={{ headerShown: false }} />
        <Stack.Screen name="create-group" options={{ presentation: 'modal', title: 'Create Group' }} />
        <Stack.Screen name="create-match" options={{ presentation: 'modal', title: 'Create Match' }} />
        <Stack.Screen name="settings/index" options={{ headerShown: false }} />
        <Stack.Screen name="settings/premium" options={{ headerShown: false }} />
        <Stack.Screen name="notifications" options={{ headerShown: false }} />
        <Stack.Screen name="edit-profile" options={{ headerShown: false }} />
      </Stack>
      <StatusBar style="auto" />
    </>
  );
}


// Web container to constrain width like a mobile phone
function WebMobileContainer({ children }: { children: React.ReactNode }) {
  const { isDark } = useTheme();

  if (Platform.OS === 'web') {
    return (
      <View style={{
        flex: 1,
        backgroundColor: isDark ? '#1a1a1a' : '#e5e5e5',
        alignItems: 'center',
      }}>
        <View style={{
          flex: 1,
          width: '100%',
          maxWidth: 430,
          backgroundColor: isDark ? '#0a0a0a' : '#f5f5f5',
          overflow: 'hidden',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.3,
          shadowRadius: 20,
        }}>
          {children}
        </View>
      </View>
    );
  }

  return <>{children}</>;
}

import AnimatedSplash from '../components/AnimatedSplash';
import { AlertProvider } from '../components/CustomAlertProvider';
import { ErrorBoundary } from '../components/ErrorBoundary';
import NetworkStatusBanner from '../components/NetworkStatusBanner';
import { NotificationProvider } from '../context/NotificationContext';

export default function RootLayout() {
  // ThemeProvider sits above the splash so the saved theme is loaded before the first app frame.
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <AppRoot />
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppRoot() {
  const { ready: themeReady } = useTheme();
  const [fontsLoaded] = useFonts({
    Barlow_400Regular,
    Barlow_500Medium,
    Barlow_600SemiBold,
    Barlow_700Bold,
    Barlow_800ExtraBold,
    BarlowCondensed_400Regular,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
  });

  const [splashDone, setSplashDone] = useState(false);

  const isAppReady = fontsLoaded && themeReady;

  // If splash animation is not done, show the AnimatedSplash overlay
  if (!splashDone) {
    return (
      <AnimatedSplash
        isReady={isAppReady}
        onAnimationComplete={() => setSplashDone(true)}
      />
    );
  }

  // Apply Barlow as default font for ALL Text/TextInput components
  setDefaultFonts();

  return (
    <ErrorBoundary>
      <WebMobileContainer>
        <AlertProvider>
          <AuthProvider>
            <NotificationProvider>
              <PremiumProvider>
                <RootLayoutNav />
                <NetworkStatusBanner />
              </PremiumProvider>
            </NotificationProvider>
          </AuthProvider>
        </AlertProvider>
      </WebMobileContainer>
    </ErrorBoundary>
  );
}
