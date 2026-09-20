import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { View, useColorScheme } from 'react-native';
import { getThemeColors } from '../../constants/designTokens';

/**
 * register.tsx — Bu route artık yalnızca auth/login sayfasına
 * "register" sekmesiyle yönlendirme yapar.
 * Tüm kayıt mantığı auth/login.tsx içinde yönetilmektedir.
 */
export default function RegisterRedirect() {
  const router = useRouter();
  const isDark = useColorScheme() === 'dark';
  const params = useLocalSearchParams<{ email?: string }>();

  useEffect(() => {
    const query = new URLSearchParams({ tab: 'register' });
    if (params.email) query.set('email', params.email);
    router.replace(`/auth/login?${query.toString()}` as any);
  }, []);

  return <View style={{ flex: 1, backgroundColor: getThemeColors(isDark).background }} />;
}
