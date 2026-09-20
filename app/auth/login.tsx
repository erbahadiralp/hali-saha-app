import { Ionicons } from '@expo/vector-icons';
import * as Google from 'expo-auth-session/providers/google';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import {
  GoogleAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithCredential,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useColorScheme,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAlert } from '../../components/CustomAlertProvider';
import PasswordStrengthMeter from '../../components/PasswordStrengthMeter';
import { getThemeColors, palette, withOpacity } from '../../constants/designTokens';
import { auth, db } from '../../firebaseConfig';
import { getUserByUsername } from '../../services/firestore';
import { ensureUserProfile } from '../../services/onboardingService';
import { getErrorMessage } from '../../utils/errorMessages';
import { checkRateLimit, formatRetryTime, RATE_LIMITS, resetRateLimit } from '../../utils/rateLimiter';

WebBrowser.maybeCompleteAuthSession();

const ANDROID_CLIENT_ID = 'YOUR_ANDROID_CLIENT_ID';
const IOS_CLIENT_ID = 'YOUR_IOS_CLIENT_ID';
const WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID';

/** Theme-aware colors derived from designTokens */
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
    greenLink: isDark ? palette.greenBright : palette.greenText,
    divider: T.divider,
    socialBg: T.surface,
    socialBorder: T.border,
    socialIcon: T.textTertiary,
    socialText: T.textSecondary,
    error: T.error,
    footerMuted: T.textSecondary,
    legalMuted: T.textTertiary,
    // Unchecked box needs a visible outline on the white light-theme card.
    checkboxBorder: isDark ? withOpacity(palette.white, 0.25) : palette.placeholder,
    checkboxBg: T.input,
    checkboxOn: T.primary,
    shadow: T.shadow,
  };
}

export default function AuthScreen() {
  const router = useRouter();
  const { alert } = useAlert();
  const C = useColors();
  const params = useLocalSearchParams<{ tab?: string; email?: string }>();

  const [activeTab, setActiveTab] = useState<'login' | 'register'>(
    params.tab === 'register' ? 'register' : 'login'
  );

  /* ── Login state ─────────────────────────────────────────────────── */
  const [identifier, setIdentifier] = useState(params.email || '');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [showLoginPw, setShowLoginPw] = useState(false);

  /* ── Register state ──────────────────────────────────────────────── */
  const [name, setName] = useState('');
  const [email, setEmail] = useState(params.email || '');
  const [regPassword, setRegPassword] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [regLoading, setRegLoading] = useState(false);
  const [showRegPw, setShowRegPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);
  const [eulaAccepted, setEulaAccepted] = useState(false);
  const [emailErr, setEmailErr] = useState('');

  /* ── Google Auth ─────────────────────────────────────────────────── */
  const [request, response, promptAsync] = Google.useAuthRequest({
    androidClientId: ANDROID_CLIENT_ID,
    iosClientId: IOS_CLIENT_ID,
    webClientId: WEB_CLIENT_ID,
  });

  useEffect(() => {
    if (response?.type === 'success') {
      const { id_token } = response.params;
      const cred = GoogleAuthProvider.credential(id_token);
      setLoginLoading(true);
      signInWithCredential(auth, cred)
        .catch((e) => alert('Hata', getErrorMessage(e), [], { type: 'error' }))
        .finally(() => setLoginLoading(false));
    }
  }, [response]);

  useEffect(() => { if (params.tab === 'register') setActiveTab('register'); }, [params.tab]);

  /* ── Email validation ────────────────────────────────────────────── */
  const validDomains = [
    'gmail.com','hotmail.com','outlook.com','yahoo.com','icloud.com',
    'mail.com','protonmail.com','yandex.com','live.com','msn.com',
    '.edu.tr','.gov.tr','.edu','.ac.uk',
  ];
  useEffect(() => {
    if (!email) { setEmailErr(''); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setEmailErr('Geçerli bir e-posta girin'); return;
    }
    const d = email.split('@')[1]?.toLowerCase();
    const ok = validDomains.some(v => v.startsWith('.') ? d?.endsWith(v) : d === v);
    setEmailErr(ok ? '' : 'Geçerli bir e-posta servisi kullanın');
  }, [email]);

  /* ── Login handler ───────────────────────────────────────────────── */
  const handleLogin = async () => {
    if (!identifier || !loginPassword) {
      alert('Hata', 'Lütfen tüm alanları doldurun.', [], { type: 'error' }); return;
    }
    const rc = checkRateLimit('login', RATE_LIMITS.login);
    if (!rc.allowed) {
      alert('Çok Fazla Deneme', `${formatRetryTime(rc.retryAfterMs)} sonra deneyin.`, [], { type: 'warning' }); return;
    }
    setLoginLoading(true);
    try {
      let loginEmail = identifier;
      if (!identifier.includes('@')) {
        const u = await getUserByUsername(identifier);
        if (u?.email) loginEmail = u.email;
        else { alert('Hata', 'E-posta veya şifre hatalı.', [], { type: 'error' }); return; }
      }
      await signInWithEmailAndPassword(auth, loginEmail, loginPassword);
      resetRateLimit('login');
    } catch (e: any) {
      alert('Hata', getErrorMessage(e), [], { type: 'error' });
    } finally { setLoginLoading(false); }
  };

  /* ── Register handler ────────────────────────────────────────────── */
  const handleRegister = async () => {
    if (!name || !email || !regPassword || !confirmPw) {
      alert('Hata', 'Lütfen tüm alanları doldurun.', [], { type: 'error' }); return;
    }
    const rc = checkRateLimit('register', RATE_LIMITS.register);
    if (!rc.allowed) {
      alert('Çok Fazla Deneme', `${formatRetryTime(rc.retryAfterMs)} sonra deneyin.`, [], { type: 'warning' }); return;
    }
    if (regPassword !== confirmPw) { alert('Hata', 'Şifreler eşleşmiyor.', [], { type: 'error' }); return; }
    if (emailErr) { alert('Hata', emailErr, [], { type: 'error' }); return; }
    if (regPassword.length < 8) { alert('Hata', 'Şifre en az 8 karakter.', [], { type: 'error' }); return; }
    if (!eulaAccepted) { alert('Hata', 'Koşulları kabul etmelisiniz.', [], { type: 'warning' }); return; }
    setRegLoading(true);
    try {
      const { user } = await createUserWithEmailAndPassword(auth, email, regPassword);
      await sendEmailVerification(user);
      await updateProfile(user, {
        displayName: name,
        photoURL: `https://ui-avatars.com/api/?name=${encodeURIComponent(name)}&background=random`,
      });
      // Same profile + onboarding path as Google/Apple; the username is chosen in onboarding.
      await ensureUserProfile(user, { name });
      await setDoc(doc(db, 'users', user.uid), { name, displayName: name, bio: `${name} sahaya adım attı! ⚽` }, { merge: true });
      alert('Kayıt Başarılı', 'Hesabın oluşturuldu. Doğrulama e-postası gönderdik; şimdi profilini tamamlayalım.', [], { type: 'success' });
    } catch (e: any) {
      alert('Hata', getErrorMessage(e), [], { type: 'error' });
    } finally { setRegLoading(false); }
  };

  /* ── Social ──────────────────────────────────────────────────────── */
  const handleGoogle = async () => {
    if (!request) { alert('Hata', 'Google girişi kullanılamıyor.', [], { type: 'error' }); return; }
    try { await promptAsync(); } catch { alert('Hata', 'Google başlatılamadı.', [], { type: 'error' }); }
  };
  const handleApple = () =>
    alert('Apple ile Giriş', 'Bu özellik yakında aktif olacak.', [{ text: 'Tamam' }], { type: 'info' });

  /* ═══════════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════════ */
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
          style={{ flex: 1 }}
        >
          <ScrollView
            contentContainerStyle={st.scroll}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            bounces={false}
          >
            {/* Card is vertically centered in the space above the footer */}
            <View style={st.cardArea}>
            <View style={[st.card, { backgroundColor: C.card, borderColor: C.cardBorder, shadowColor: C.shadow }, !C.isDark && st.cardShadow]}>

              {activeTab === 'login' ? (
                /* ═══════════ LOGIN ═══════════ */
                <>
                  <Text style={[st.pageTitle, { color: C.text }]}>Giriş Yap</Text>
                  <Text style={[st.pageSubtitle, { color: C.subtitle }]}>Sahaya dönme zamanı, hazır mısın?</Text>

                  <View style={{ marginTop: 24 }}>
                    <Text style={[st.fieldLabel, { color: C.label }]}>E-POSTA / KULLANICI ADI</Text>
                    <View style={[st.inputWrap, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                      <TextInput
                        style={[st.input, { color: C.text }]}
                        placeholder="emre@futbol.com"
                        placeholderTextColor={C.placeholder}
                        value={identifier}
                        onChangeText={setIdentifier}
                        autoCapitalize="none"
                        keyboardType="email-address"
                        autoCorrect={false}
                      />
                    </View>

                    <Text style={[st.fieldLabel, { color: C.label, marginTop: 16 }]}>ŞİFRE</Text>
                    <View style={[st.inputWrap, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                      <TextInput
                        key={showLoginPw ? 'pw-visible' : 'pw-hidden'}
                        style={[st.input, { color: C.text }]}
                        placeholder="••••••••"
                        placeholderTextColor={C.placeholder}
                        value={loginPassword}
                        onChangeText={setLoginPassword}
                        secureTextEntry={!showLoginPw}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TouchableOpacity
                        onPress={() => setShowLoginPw(v => !v)}
                        hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                      >
                        <Ionicons
                          name={showLoginPw ? 'eye-outline' : 'eye-off-outline'}
                          size={20}
                          color={C.socialIcon}
                        />
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={st.forgotRow}
                      onPress={() => router.push('/auth/forgot-password')}
                    >
                      <Text style={[st.forgotText, { color: C.subtitle }]}>Şifremi Unuttum</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={[st.ctaBtn, { backgroundColor: C.ctaGreen }]}
                    onPress={handleLogin}
                    disabled={loginLoading}
                    activeOpacity={0.8}
                  >
                    {loginLoading
                      ? <ActivityIndicator color={C.ctaText} />
                      : <Text style={[st.ctaText, { color: C.ctaText }]}>Giriş Yap</Text>}
                  </TouchableOpacity>

                  <View style={st.dividerRow}>
                    <View style={[st.dividerLine, { backgroundColor: C.divider }]} />
                    <Text style={[st.dividerLabel, { color: C.label }]}>VEYA</Text>
                    <View style={[st.dividerLine, { backgroundColor: C.divider }]} />
                  </View>

                  <View style={st.socialRow}>
                    <TouchableOpacity style={[st.socialBtn, { backgroundColor: C.socialBg, borderColor: C.socialBorder }]} onPress={handleGoogle} disabled={!request} activeOpacity={0.7}>
                      <Ionicons name="logo-google" size={18} color={C.socialIcon} />
                      <Text style={[st.socialBtnText, { color: C.socialText }]}>Google</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[st.socialBtn, { backgroundColor: C.socialBg, borderColor: C.socialBorder }]} onPress={handleApple} activeOpacity={0.7}>
                      <Ionicons name="logo-apple" size={20} color={C.socialIcon} />
                      <Text style={[st.socialBtnText, { color: C.socialText }]}>Apple</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                /* ═══════════ REGISTER ═══════════ */
                <>
                  <Text style={[st.pageTitle, st.pageTitleCompact, { color: C.text }]}>Profilini Oluştur</Text>
                  <Text style={[st.pageSubtitle, { color: C.subtitle }]}>Hızlıca kaydol, sahada yerini al.</Text>

                  <View style={{ marginTop: 16 }}>
                    <Text style={[st.fieldLabel, { color: C.label }]}>AD SOYAD</Text>
                    <View style={[st.inputWrap, st.inputCompact, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                      <TextInput style={[st.input, { color: C.text }]} placeholder="Emre Yılmaz" placeholderTextColor={C.placeholder} value={name} onChangeText={setName} autoCapitalize="words" />
                    </View>

                    <Text style={[st.fieldLabel, st.fieldGap, { color: C.label }]}>E-POSTA</Text>
                    <View style={[st.inputWrap, st.inputCompact, { backgroundColor: C.inputBg, borderColor: emailErr ? C.error : C.inputBorder }]}>
                      <TextInput style={[st.input, { color: C.text }]} placeholder="you@example.com" placeholderTextColor={C.placeholder} value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoCorrect={false} />
                    </View>
                    {emailErr ? <Text style={[st.errText, { color: C.error }]}>{emailErr}</Text> : null}

                    <Text style={[st.fieldLabel, st.fieldGap, { color: C.label }]}>ŞİFRE</Text>
                    <View style={[st.inputWrap, st.inputCompact, { backgroundColor: C.inputBg, borderColor: C.inputBorder }]}>
                      <TextInput
                        key={showRegPw ? 'rpw-vis' : 'rpw-hid'}
                        style={[st.input, { color: C.text }]}
                        placeholder="GucluSifre"
                        placeholderTextColor={C.placeholder}
                        value={regPassword}
                        onChangeText={setRegPassword}
                        secureTextEntry={!showRegPw}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TouchableOpacity onPress={() => setShowRegPw(v => !v)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <Ionicons name={showRegPw ? 'eye-outline' : 'eye-off-outline'} size={20} color={C.socialIcon} />
                      </TouchableOpacity>
                    </View>
                    <PasswordStrengthMeter password={regPassword} />

                    <Text style={[st.fieldLabel, st.fieldGap, { color: C.label }]}>ŞİFRE TEKRAR</Text>
                    <View style={[st.inputWrap, st.inputCompact, { backgroundColor: C.inputBg, borderColor: confirmPw && confirmPw !== regPassword ? C.error : C.inputBorder }]}>
                      <TextInput
                        key={showConfirmPw ? 'cpw-vis' : 'cpw-hid'}
                        style={[st.input, { color: C.text }]}
                        placeholder="••••••••"
                        placeholderTextColor={C.placeholder}
                        value={confirmPw}
                        onChangeText={setConfirmPw}
                        secureTextEntry={!showConfirmPw}
                        autoCapitalize="none"
                        autoCorrect={false}
                      />
                      <TouchableOpacity onPress={() => setShowConfirmPw(v => !v)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                        <Ionicons name={showConfirmPw ? 'eye-outline' : 'eye-off-outline'} size={20} color={C.socialIcon} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* KVKK */}
                  <Pressable
                    style={st.eulaRow}
                    onPress={() => setEulaAccepted(v => !v)}
                    hitSlop={{ top: 6, bottom: 6 }}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: eulaAccepted }}
                  >
                    <View
                      style={[
                        st.checkbox,
                        { backgroundColor: C.checkboxBg, borderColor: C.checkboxBorder },
                        eulaAccepted && { backgroundColor: C.checkboxOn, borderColor: C.checkboxOn },
                      ]}
                    >
                      {eulaAccepted && <Ionicons name="checkmark" size={14} color={C.ctaText} />}
                    </View>
                    <Text style={[st.eulaText, { color: C.footerMuted }]}>
                      <Text style={[st.eulaLink, { color: C.greenLink }]} onPress={() => router.push('/terms-of-service')}>Kullanım Koşulları</Text>
                      {' ve '}
                      <Text style={[st.eulaLink, { color: C.greenLink }]} onPress={() => router.push('/kvkk-aydinlatma')}>KVKK</Text>
                      {' metnini okudum, onaylıyorum.'}
                    </Text>
                  </Pressable>

                  <TouchableOpacity
                    style={[st.ctaBtn, st.ctaCompact, { backgroundColor: C.ctaGreen }, (!eulaAccepted || regLoading) && { opacity: 0.45 }]}
                    onPress={handleRegister}
                    disabled={regLoading || !eulaAccepted}
                    activeOpacity={0.8}
                  >
                    {regLoading ? <ActivityIndicator color={C.ctaText} /> : <Text style={[st.ctaText, { color: C.ctaText }]}>Kayıt Ol</Text>}
                  </TouchableOpacity>

                  <View style={st.socialRow}>
                    <TouchableOpacity style={[st.socialBtn, st.socialCompact, { backgroundColor: C.socialBg, borderColor: C.socialBorder }]} onPress={handleGoogle} disabled={!request} activeOpacity={0.7}>
                      <Ionicons name="logo-google" size={18} color={C.socialIcon} />
                      <Text style={[st.socialBtnText, { color: C.socialText }]}>Google</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[st.socialBtn, st.socialCompact, { backgroundColor: C.socialBg, borderColor: C.socialBorder }]} onPress={handleApple} activeOpacity={0.7}>
                      <Ionicons name="logo-apple" size={20} color={C.socialIcon} />
                      <Text style={[st.socialBtnText, { color: C.socialText }]}>Apple</Text>
                    </TouchableOpacity>
                  </View>
                </>
              )}
            </View>
            </View>

            {/* Footer — outside the card, pinned to the bottom */}
            <View style={st.footerArea}>
              {activeTab === 'login' ? (
                <>
                  <View style={st.footer}>
                    <Text style={[st.footerMuted, { color: C.footerMuted }]}>Hesabın yok mu?</Text>
                    <TouchableOpacity onPress={() => setActiveTab('register')} hitSlop={{ top: 10, bottom: 10 }}>
                      <Text style={[st.footerLink, { color: C.greenLink }]}> Hesap Oluştur</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={st.legalRow}>
                    <TouchableOpacity onPress={() => router.push('/privacy-policy')}>
                      <Text style={[st.legalText, { color: C.legalMuted }]}>Gizlilik Politikası</Text>
                    </TouchableOpacity>
                    <Text style={[st.legalDot, { color: C.legalMuted }]}>  •  </Text>
                    <TouchableOpacity onPress={() => router.push('/terms-of-service')}>
                      <Text style={[st.legalText, { color: C.legalMuted }]}>Kullanım Koşulları</Text>
                    </TouchableOpacity>
                    <Text style={[st.legalDot, { color: C.legalMuted }]}>  •  </Text>
                    <TouchableOpacity onPress={() => router.push('/kvkk-aydinlatma')}>
                      <Text style={[st.legalText, { color: C.legalMuted }]}>KVKK</Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <View style={st.footer}>
                  <Text style={[st.footerMuted, { color: C.footerMuted }]}>Zaten üye misin?</Text>
                  <TouchableOpacity onPress={() => setActiveTab('login')} hitSlop={{ top: 10, bottom: 10 }}>
                    <Text style={[st.footerLink, { color: C.greenLink }]}> Giriş Yap</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </View>
  );
}

const st = StyleSheet.create({
  scroll: {
    flexGrow: 1,
    paddingTop: 16,
    paddingBottom: 12,
  },
  cardArea: {
    flex: 1,
    justifyContent: 'center',
  },
  card: {
    borderRadius: 28,
    borderWidth: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
    paddingBottom: 24,
  },
  cardShadow: {
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 3,
  },
  pageTitle: {
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 0.1,
    marginBottom: 6,
  },
  pageTitleCompact: {
    fontSize: 28,
    marginBottom: 4,
  },
  fieldGap: {
    marginTop: 12,
  },
  inputCompact: {
    height: 46,
  },
  ctaCompact: {
    height: 50,
    marginTop: 14,
    marginBottom: 12,
  },
  socialCompact: {
    height: 44,
  },
  footerArea: {
    paddingTop: 24,
    paddingBottom: 8,
  },
  pageSubtitle: {
    fontSize: 14,
    fontWeight: '400',
    lineHeight: 20,
  },
  fieldLabel: {
    fontSize: 11,
    fontWeight: '600',
    letterSpacing: 1.2,
    marginBottom: 6,
  },
  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 14,
    borderWidth: 1,
    height: 50,
    paddingHorizontal: 16,
  },
  input: {
    flex: 1,
    fontSize: 15,
    fontWeight: '400',
  },
  errText: {
    fontSize: 11,
    marginTop: 4,
    marginLeft: 4,
  },
  forgotRow: {
    alignSelf: 'flex-end',
    marginTop: 10,
    marginBottom: 4,
  },
  forgotText: {
    fontSize: 13,
    fontWeight: '500',
  },
  ctaBtn: {
    borderRadius: 16,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 16,
  },
  ctaText: {
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    gap: 14,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
  },
  dividerLabel: {
    fontSize: 11,
    fontWeight: '500',
    letterSpacing: 1.5,
  },
  socialRow: {
    flexDirection: 'row',
    gap: 10,
  },
  socialBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  socialBtnText: {
    fontSize: 14,
    fontWeight: '600',
  },
  eulaRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginTop: 14,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  eulaText: {
    flex: 1,
    fontSize: 12.5,
    lineHeight: 18,
    marginTop: 2,
  },
  eulaLink: {
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerMuted: {
    fontSize: 14,
  },
  footerLink: {
    fontSize: 14,
    fontWeight: '700',
  },
  legalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 14,
  },
  legalText: {
    fontSize: 11,
  },
  legalDot: {
    fontSize: 11,
  },
});
