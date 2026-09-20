import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SettingsScreen, useSettingsColors } from '../settings/SettingsUI';

/** Shared legal page template — layout: design/tasarım/macvar-screens-6.html (Yasal Sayfa); colors from designTokens. */

/** A bullet is plain text or a bold lead-in followed by text ("Hesap Bilgileri: Ad, e-posta"). */
export type LegalBullet = string | { bold: string; text: string };

export interface LegalSection {
    title?: string;
    /** Paragraph(s) before the bullets. */
    body?: string;
    bullets?: LegalBullet[];
    /** Paragraph(s) after the bullets. */
    after?: string;
}

export default function LegalScreen({ title, updated, sections }: { title: string; updated: string; sections: LegalSection[] }) {
    const C = useSettingsColors();
    const insets = useSafeAreaInsets();

    const paragraph = (text: string) => (
        <Text style={[st.p, { color: C.textSecondary }]}>{text}</Text>
    );

    return (
        <SettingsScreen title={title}>
            <Text style={[st.updated, { color: C.textTertiary }]}>Son güncelleme: {updated}</Text>
            <ScrollView
                style={{ flex: 1 }}
                contentContainerStyle={[st.content, { paddingBottom: insets.bottom + 32 }]}
                showsVerticalScrollIndicator={false}
            >
                {sections.map((section, i) => (
                    <View key={section.title ?? `intro-${i}`}>
                        {section.title ? <Text style={[st.h, { color: C.text }]}>{section.title}</Text> : null}
                        {section.body ? paragraph(section.body) : null}
                        {section.bullets?.length ? (
                            <View style={st.bullets}>
                                {section.bullets.map((bullet, j) => (
                                    <View key={j} style={st.bulletRow}>
                                        <View style={[st.dot, { backgroundColor: C.link }]} />
                                        <Text style={[st.bulletText, { color: C.textSecondary }]}>
                                            {typeof bullet === 'string' ? bullet : (
                                                <>
                                                    <Text style={[st.bold, { color: C.text }]}>{bullet.bold}: </Text>
                                                    {bullet.text}
                                                </>
                                            )}
                                        </Text>
                                    </View>
                                ))}
                            </View>
                        ) : null}
                        {section.after ? paragraph(section.after) : null}
                    </View>
                ))}
            </ScrollView>
        </SettingsScreen>
    );
}

const st = StyleSheet.create({
    updated: { fontSize: 12, fontWeight: '600', paddingHorizontal: 20, marginTop: -4, marginBottom: 8 },
    content: { paddingHorizontal: 20 },
    h: { fontSize: 15, fontWeight: '800', marginTop: 18, marginBottom: 8 },
    p: { fontSize: 13.5, fontWeight: '500', lineHeight: 22, marginBottom: 12 },
    bullets: { gap: 8, marginBottom: 12 },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
    dot: { width: 5, height: 5, borderRadius: 3, marginTop: 9 },
    bulletText: { flex: 1, fontSize: 13.5, fontWeight: '500', lineHeight: 22 },
    bold: { fontWeight: '700' },
});
