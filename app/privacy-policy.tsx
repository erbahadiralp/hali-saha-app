import LegalScreen, { LegalSection } from '../components/legal/LegalScreen';

const SECTIONS: LegalSection[] = [
    {
        title: '1. Giriş',
        body: 'Kadrola ("Uygulama") olarak, gizliliğinize saygı duyuyor ve kişisel verilerinizi korumayı taahhüt ediyoruz. Bu Gizlilik Politikası, Uygulamamızı kullanırken toplanan, kullanılan ve paylaşılan bilgiler hakkında sizi bilgilendirmek amacıyla hazırlanmıştır.',
    },
    {
        title: '2. Toplanan Veriler',
        body: 'Uygulamamızı kullanırken aşağıdaki verileri toplayabiliriz:',
        bullets: [
            { bold: 'Hesap Bilgileri', text: 'Ad, e-posta adresi, profil fotoğrafı' },
            { bold: 'Profil Bilgileri', text: 'Kullanıcı adı, pozisyon, boy, kilo, tercih edilen ayak' },
            { bold: 'Maç Verileri', text: 'Maç istatistikleri, gol, asist, MVP oylamaları' },
            { bold: 'Konum Bilgileri', text: 'Şehir ve ilçe (saha bulma amaçlı)' },
            { bold: 'Cihaz Bilgileri', text: "Push notification token'ları" },
        ],
    },
    {
        title: '3. Verilerin Kullanımı',
        body: 'Toplanan veriler yalnızca aşağıdaki amaçlarla kullanılır:',
        bullets: [
            'Hesap oluşturma ve kimlik doğrulama',
            'Maç organizasyonu ve kadro dengeleme',
            'İstatistik hesaplama ve performans takibi',
            'Push bildirimler gönderme',
            'Uygulama deneyimini iyileştirme',
        ],
    },
    {
        title: '4. Veri Paylaşımı',
        body: 'Kişisel verileriniz üçüncü taraflarla paylaşılmaz. Verileriniz yalnızca Firebase (Google) altyapısı üzerinde güvenli bir şekilde saklanır.',
    },
    {
        title: '5. Veri Güvenliği',
        body: 'Verilerinizi korumak için endüstri standardı güvenlik önlemleri kullanıyoruz:',
        bullets: [
            'Firebase Authentication ile güvenli oturum yönetimi',
            'Firestore Security Rules ile veri erişim kontrolü',
            'SSL/TLS şifreleme ile güvenli veri iletimi',
        ],
    },
    {
        title: '6. Hesap Silme',
        body: 'Hesabınızı istediğiniz zaman Ayarlar sayfasından silebilirsiniz. Hesap silme işlemi geri alınamaz ve aşağıdaki veriler kalıcı olarak silinir:',
        bullets: ['Profil bilgileriniz', 'İstatistikleriniz', 'Grup üyelikleriniz', 'Bildirimleriniz'],
        after: 'Maç geçmişi verileri, diğer kullanıcıların istatistik bütünlüğü için anonim olarak saklanabilir.',
    },
    {
        title: '7. Çocukların Gizliliği',
        body: 'Uygulamamız 13 yaşın altındaki çocuklara yönelik değildir. 13 yaşın altındaki kullanıcılardan bilerek kişisel veri toplamayız.',
    },
    {
        title: '8. Değişiklikler',
        body: 'Bu Gizlilik Politikası zaman zaman güncellenebilir. Değişiklikler uygulama içi bildirim ile duyurulacaktır.',
    },
    {
        title: '9. İletişim',
        body: 'Gizlilik politikamızla ilgili sorularınız için: destek@macvar.com',
    },
];

export default function PrivacyPolicyScreen() {
    return <LegalScreen title="Gizlilik Politikası" updated="Şubat 2026" sections={SECTIONS} />;
}
