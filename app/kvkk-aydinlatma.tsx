import LegalScreen, { LegalSection } from '../components/legal/LegalScreen';

const SECTIONS: LegalSection[] = [
    {
        body: '6698 sayılı Kişisel Verilerin Korunması Kanunu ("KVKK") uyarınca, kişisel verilerinizin işlenmesine ilişkin sizleri bilgilendirmek amacıyla bu aydınlatma metni hazırlanmıştır.',
    },
    {
        title: '1. Veri Sorumlusu',
        body: 'MaçVar Yazılım · kvkk@macvar.com',
    },
    {
        title: '2. Toplanan Kişisel Veriler',
        body: 'Uygulamamız kapsamında aşağıdaki kişisel veriler toplanmaktadır:',
        bullets: [
            { bold: 'Kimlik Bilgisi', text: 'Ad, soyad' },
            { bold: 'İletişim Bilgisi', text: 'E-posta adresi' },
            { bold: 'Görsel Kayıt', text: 'Profil fotoğrafı' },
            { bold: 'Konum Bilgisi', text: 'Şehir, ilçe (halı saha konumu)' },
            { bold: 'İşlem Güvenliği', text: 'IP adresi, cihaz bilgileri, push notification token' },
            { bold: 'Performans Verileri', text: 'Maç istatistikleri (gol, asist, MVP oylamaları)' },
        ],
    },
    {
        title: '3. Kişisel Verilerin İşlenme Amacı',
        body: 'Toplanan kişisel veriler aşağıdaki amaçlarla işlenmektedir:',
        bullets: [
            'Üyelik hesabı oluşturma ve kimlik doğrulama',
            'Maç organizasyonu ve kadro dengeleme hizmeti sunma',
            'İstatistik hesaplama ve performans takibi',
            'Push bildirim gönderimi',
            'Uygulama güvenliğinin sağlanması',
            'Yasal yükümlülüklerin yerine getirilmesi',
        ],
    },
    {
        title: '4. Kişisel Verilerin Aktarımı',
        body: 'Kişisel verileriniz, hizmet sunumu amacıyla aşağıdaki üçüncü taraf hizmet sağlayıcılarla paylaşılabilmektedir:',
        bullets: [
            { bold: 'Firebase (Google Cloud - ABD)', text: 'Kimlik doğrulama, veritabanı ve depolama' },
            { bold: 'RevenueCat (ABD)', text: 'Abonelik yönetimi' },
        ],
        after: "Verileriniz yurt dışına aktarılırken KVKK'nın öngördüğü güvenlik önlemleri uygulanmaktadır.",
    },
    {
        title: '5. Veri Toplama Yöntemi ve Hukuki Sebebi',
        body: 'Kişisel verileriniz, mobil uygulama aracılığıyla elektronik ortamda toplanmakta olup aşağıdaki hukuki sebeplere dayanmaktadır:',
        bullets: ['Açık rızanız (kayıt sırasında onay)', 'Sözleşmenin kurulması ve ifası', 'Meşru menfaat'],
    },
    {
        title: '6. Kişisel Veri Sahibinin Hakları (KVKK m.11)',
        body: "KVKK'nın 11. maddesi uyarınca aşağıdaki haklara sahipsiniz:",
        bullets: [
            'Kişisel verilerinizin işlenip işlenmediğini öğrenme',
            'İşlenmişse buna ilişkin bilgi talep etme',
            'İşlenme amacını ve amacına uygun kullanılıp kullanılmadığını öğrenme',
            'Yurt içi veya yurt dışında aktarıldığı üçüncü kişileri bilme',
            'Eksik veya yanlış işlenmiş ise düzeltilmesini isteme',
            'KVKK m.7 kapsamında silinmesini veya yok edilmesini isteme',
            'İşlenen verilerin münhasıran otomatik sistemler ile analiz edilmesi suretiyle aleyhinize bir sonucun ortaya çıkmasına itiraz etme',
            'Kanuna aykırı işlenme sebebiyle zarara uğramanız halinde zararın giderilmesini talep etme',
        ],
    },
    {
        title: '7. Hesap Silme',
        body: 'Hesabınızı Ayarlar > Hesabı Sil bölümünden istediğiniz zaman silebilirsiniz. Hesap silindiğinde tüm kişisel verileriniz kalıcı olarak silinir.',
    },
    {
        title: '8. Başvuru Yöntemi',
        body: 'Yukarıda belirtilen haklarınızı kullanmak için kvkk@macvar.com adresinden bize ulaşabilirsiniz.',
        after: 'Talebinize en geç 30 gün içinde ücretsiz olarak yanıt verilecektir. İşlemin ayrıca bir maliyet gerektirmesi halinde, Kişisel Verileri Koruma Kurulu tarafından belirlenen tarifedeki ücret alınabilir.',
    },
];

export default function KVKKScreen() {
    return <LegalScreen title="KVKK Aydınlatma Metni" updated="Şubat 2026" sections={SECTIONS} />;
}
