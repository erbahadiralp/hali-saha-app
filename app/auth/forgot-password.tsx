import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { sendPasswordResetEmail } from 'firebase/auth';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAlert } from '../../components/CustomAlertProvider';
import { getThemeColors, palette } from '../../constants/designTokens';
import { auth } from '../../firebaseConfig';
import { getErrorMessage } from '../../utils/errorMessages';

function useColors() {
  const isDark = useColorScheme() === 'dark';
  const T = getThemeColors(isDark);
  return {
    isDark,
    bgGradient: [T.gradient[0], T.gradient[1]] as [string, string],
    card: T.card,
    cardBorder: T.border,
    inputBg: T.input,
    inputBorder: T.border,
    text: T.text,
    subtitle: T.textSecondary,
    label: T.textSecondary,
    placeholder: T.placeholder,
    ctaGreen: T.primary,
    ctaText: T.onPrimary,
    greenAccent: isDark ? palette.greenBright : palette.greenText,
  };
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { alert } = useAlert();
  const C = useColors();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) {
      alert('Hata', 'Lütfen e-posta adresinizi girin.', [], { type: 'error' }); return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      alert('Hata', 'Geçerli bir e-posta adresi girin.', [], { type: 'error' }); return;
    }
    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, email.trim());
      alert('Gönderildi', `${email.trim()} adresine şifre sıfırlama bağlantısı gönderildi.`,
        [{ text: 'Tamam', onPress: () => router.back() }], { type: 'success' });
    } catch (e: any) {
      if (e.code === 'auth/user-not-found')
        alert('Hata', 'Bu e-posta ile hesap bulunamadı.', [], { type: 'error' });
      else if (e.code === 'auth/too-many-requests')
        alert('Hata', 'Çok fazla deneme. Daha sonra tekrar deneyin.', [], { type: 'warning' });
      else alert('Hata', getErrorMessage(e), [], { type: 'error' });
    } finally { setLoading(false); }
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bgGradient[0] }}>
      <LinearGradient
        colors={C.bgGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={{ flex: 1 }}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{ flex: 1, justifyContent: 'center' }}
        >
          {/* Card centered vertically */}
          <View style={[st.card, { backgroundColor: C.card, borderColor: C.cardBorder }]}>
            {/* Back */}
            <TouchableOpacity style={st.backRow} onPress={() => router.back()} activeOpacity={0.7}>
              <Ionicons name="chevron-back" size={20} color={C.greenAccent} />
              <Text style={[st.backText, { color: C.greenAccent }]}>Giriş'e Dön</Text>
            </TouchableOpacity>

            {/* Title */}
            <Text style={[st.pageTitle, { color: C.text }]}>Şifremi Unuttum</Text>
            <Text style={[st.pageSubtitle, { color: C.subtitle }]}>
              Şifre sıfırlama bağlantısı e-posta adresinize gönderilecektir.
              Lütfen kayıtlı e-posta adresinizi girin.
            </Text>

            {/* Email field */}
            <View style={{ marginTop: 28 }}>
              <Text style={[st.fieldLabel, { color: C.label }]}>KAYITLI E-POSTA</Text>
              <View style={[st.inputWrap, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                <TextInput
                  style={[st.input, { color: C.text }]}
                  placeholder="ornek@halisaha.com"
                  placeholderTextColor={C.placeholder}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  keyboardType="email-address"
                  autoCorrect={false}
                  autoFocus
                />
              </View>
            </View>

            {/* CTA */}
            <TouchableOpacity
              style={[st.ctaBtn, { backgroundColor: C.ctaGreen }]}
              onPress={handleReset}
              disabled={loading}
              activeOpacity={0.8}
            >
              {loading ? (
                <ActivityIndicator color={C.ctaText} />
              ) : (
                <View style={st.ctaInner}>
                  <Ionicons name="mail-outline" size={20} color={C.ctaText} style={{ marginRight: 8 }} />
                  <Text style={[st.ctaText, { color: C.ctaText }]}>Bağlantı Gönder</Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  card: {
    borderRadius: 28,
    borderWidth: 1,
    marginHorizontal: 16,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 32,
  },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 24,
    gap: 4,
  },
  backText: {
    fontSize: 14,
    fontWeight: '500',
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.1,
    marginBottom: 12,
  },
  pageSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 22,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    height: 52,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
  },
  ctaBtn: {
    borderRadius: 16,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 28,
  },
  ctaInner: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
