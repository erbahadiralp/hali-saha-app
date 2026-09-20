import { format } from 'date-fns';
import { tr } from 'date-fns/locale';
import { LinearGradient } from 'expo-linear-gradient';
import { signOut } from 'firebase/auth';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth } from '../firebaseConfig';
import { restoreDeletedAccount } from '../services/deleteUserAccount';
import { useAlert } from './CustomAlertProvider';
import { PrimaryButton, SecondaryButton, StateView, toDate } from './group/GroupUI';
import { useSettingsColors } from './settings/SettingsUI';

/**
 * Shown when an account with a pending deletion signs in again: restore it or sign out.
 * Visual language follows the Hesap Silme screen (design/tasarım/macvar-screens-6.html); colors from designTokens.
 */
export default function AccountRecoveryScreen({ profile, onRestored }: { profile: any; onRestored: () => void }) {
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();
    const { alert } = useAlert();
    const [busy, setBusy] = useState<'restore' | 'signout' | null>(null);

    const scheduled = profile?.deletionScheduledFor ? toDate(profile.deletionScheduledFor) : null;
    const when = scheduled ? format(scheduled, 'd MMMM yyyy', { locale: tr }) : null;

    const restore = async () => {
        setBusy('restore');
        try {
            await restoreDeletedAccount();
            onRestored();
        } catch (error) {
            console.error('Account restore failed:', error);
            alert('Hata', 'Hesabın geri yüklenemedi. Lütfen tekrar dene.', [], { type: 'error' });
            setBusy(null);
        }
    };

    const leave = async () => {
        setBusy('signout');
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Sign out failed:', error);
            setBusy(null);
        }
    };

    return (
        <View style={[st.root, { backgroundColor: C.background, paddingTop: insets.top + 24, paddingBottom: insets.bottom + 16 }]}>
            <LinearGradient colors={[C.gradient[0], C.gradient[1]]} style={StyleSheet.absoluteFill} />
            <View style={st.body}>
                <StateView
                    icon="time-outline"
                    color={C.warning}
                    title="Hesabın Silinmek Üzere"
                    text={`${when ? `Hesabın ${when} tarihinde kalıcı olarak silinecek.` : 'Hesabın yakında kalıcı olarak silinecek.'} Geri yüklersen profilin, grupların ve istatistiklerin olduğu gibi kalır; yaklaşan maçlara yeniden katılman gerekir.`}
                />
            </View>
            <View style={st.actions}>
                <PrimaryButton
                    label="Hesabımı Geri Yükle"
                    icon="refresh"
                    onPress={restore}
                    disabled={!!busy}
                    loading={busy === 'restore' ? <ActivityIndicator color={C.onPrimary} /> : undefined}
                />
                <SecondaryButton label="Çıkış Yap" onPress={leave} disabled={!!busy} />
            </View>
        </View>
    );
}

const st = StyleSheet.create({
    root: { flex: 1, paddingHorizontal: 24 },
    body: { flex: 1, justifyContent: 'center' },
    actions: { gap: 10 },
});
