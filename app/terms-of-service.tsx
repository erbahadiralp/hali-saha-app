import LegalScreen, { LegalSection } from '../components/legal/LegalScreen';

const SECTIONS: LegalSection[] = [
    {
        title: '1. Hizmet Tanımı',
        body: 'MaçVar ("Uygulama"), halı saha maçlarını organize etmek, takım kurmak ve maç istatistiklerini takip etmek için geliştirilmiş bir mobil platformdur. Uygulamayı kullanarak aşağıdaki koşulları kabul etmiş sayılırsınız.',
    },
    {
        title: '2. Kullanıcı Yükümlülükleri',
        body: 'Uygulamayı kullanırken aşağıdaki kurallara uymanız gerekmektedir:',
        bullets: [
            '13 yaş ve üzeri olmak',
            'Kayıt sırasında doğru ve güncel bilgi vermek',
            'Başkalarının haklarına saygı göstermek',
            'Spam, taciz, hakaret ve uygunsuz içerik paylaşmamak',
            'Hesap bilgilerini üçüncü kişilerle paylaşmamak',
        ],
    },
    {
        title: '3. Hesap Güvenliği',
        body: 'Hesabınızın güvenliği sizin sorumluluğunuzdadır. Şifrenizi gizli tutmalı ve başkalarıyla paylaşmamalısınız. Hesabınızda yetkisiz bir erişim fark ederseniz derhal bizimle iletişime geçmelisiniz.',
    },
    {
        title: '4. Fikri Mülkiyet',
        body: "Uygulamadaki tüm içerik, tasarım, logo ve yazılım hakları MaçVar'a aittir. Kullanıcılar tarafından oluşturulan içerikler (profil fotoğrafları vb.) için kullanıcı, uygulamada kullanılması amacıyla sınırsız lisans vermektedir.",
    },
    {
        title: '5. Ödeme ve Abonelik',
        body: "Premium abonelikler otomatik olarak yenilenir. Aboneliğinizi istediğiniz zaman App Store veya Google Play üzerinden iptal edebilirsiniz. İade talepleri Apple ve Google'ın iade politikalarına tabidir.",
    },
    {
        title: '6. Sorumluluk Reddi',
        body: 'MaçVar, aşağıdaki durumlardan sorumlu tutulamaz:',
        bullets: [
            'Maç sırasında meydana gelen yaralanmalar veya kazalar',
            'Kullanıcılar arasındaki anlaşmazlıklar',
            'Halı saha tesislerinin durumu veya kalitesi',
            'Üçüncü taraf hizmetlerden kaynaklanan kesintiler',
        ],
    },
    {
        title: '7. Hizmet Değişiklikleri',
        body: 'MaçVar, uygulamanın özelliklerini, fiyatlandırmasını ve bu kullanım koşullarını önceden bildirimde bulunmaksızın değiştirme hakkını saklı tutar. Önemli değişiklikler uygulama içi bildirim ile duyurulacaktır.',
    },
    {
        title: '8. Hesap Askıya Alma ve Silme',
        body: 'Kullanım koşullarını ihlal eden hesaplar uyarı yapılmaksızın askıya alınabilir veya kalıcı olarak silinebilir. Hesabınızı istediğiniz zaman Ayarlar sayfasından kendiniz de silebilirsiniz.',
    },
    {
        title: '9. Uyuşmazlık Çözümü',
        body: 'Bu koşullardan doğabilecek uyuşmazlıklarda Türkiye Cumhuriyeti kanunları geçerlidir. Yargı yeri İstanbul mahkemeleri ve icra daireleridir.',
    },
    {
        title: '10. İletişim',
        body: 'Kullanım koşullarıyla ilgili sorularınız için: destek@macvar.com',
    },
];

export default function TermsOfServiceScreen() {
    return <LegalScreen title="Kullanım Koşulları" updated="Şubat 2026" sections={SECTIONS} />;
}
