# MaçVar

Halı saha maçlarını organize etmek, takımları adil şekilde dengelemek ve oyuncu
istatistiklerini takip etmek için geliştirilen cross-platform mobil uygulama.

React Native + Expo ile yazıldı, Firebase üzerinde serverless çalışıyor.
iOS, Android ve web'de tek kod tabanından çalışır.

---

## Ne yapar?

**Maç organizasyonu** — Maç oluştur, kadro topla, katılımcıları yönet. Maç saati
yaklaşınca katılımcılara otomatik hatırlatma gider.

**Gruplar** — Sürekli birlikte oynayan kadrolar için grup yapısı. Grup yöneticisi,
üye daveti, grup içi sıralama ve geçmiş maç arşivi.

**Otomatik takım dengeleme** — Oyuncuların reytingine ve mevkisine bakarak iki
takımı olabildiğince eşit güçte kurar. Tek sayılı kadrolarda "joker" oyuncu atar.

**Oyuncu reytingi (Overall)** — Her oyuncunun mevkisine (Kaleci/Defans/Orta Saha/
Forvet) ve seçtiği arketipe göre 5 temel özelliği hesaplanır. Maç performansı ve
son dönem formu reytingi etkiler. Hesaplama sunucu tarafında yapılır.

**MVP oylaması** — Maç sonunda oyuncular oy verir. Skorlama mevkiye göre farklı
ağırlık kullanır; kaleci kurtarışı ile forvet golü aynı puanı getirmez.

**İstatistik ve rozetler** — Gol, asist, clean sheet, form grafiği, kazanılan
rozetler ve sosyal medyada paylaşılabilir oyuncu kartı.

**İtiraz sistemi** — Yönetici bir oyuncunun istatistiğini değiştirirse oyuncuya
bildirim gider ve 24 saatlik itiraz hakkı doğar. Süre dolarsa otomatik çözümlenir.

**Borç takibi** — Maç ücretlerinin kim tarafından ödendiğinin grup bazında takibi.

**Abonelik** — Ücretsiz / Oyuncu / Kaptan olmak üzere üç katmanlı freemium model.
RevenueCat üzerinden uygulama içi satın alma.

---

## Teknolojiler

| Katman | Kullanılanlar |
|---|---|
| Mobil | React Native 0.86, Expo SDK 57, TypeScript, Expo Router |
| Arayüz | NativeWind (Tailwind CSS), Reanimated 4, Gorhom Bottom Sheet, SVG |
| Backend | Firebase Auth, Cloud Firestore, Cloud Storage, Cloud Functions (Node 20) |
| Bildirim | Expo Notifications + Firebase Cloud Messaging |
| Ödeme | RevenueCat |
| Test | Jest, jest-expo, ts-jest |

---

## Proje yapısı

```
app/            Ekranlar (Expo Router ile dosya tabanlı yönlendirme)
components/     Yeniden kullanılabilir arayüz bileşenleri
services/       İş mantığı ve Firestore erişim katmanı
functions/      Firebase Cloud Functions (trigger, callable, zamanlanmış görevler)
constants/      Design token'lar, tema, abonelik limitleri
context/        Auth, tema, bildirim ve premium context'leri
utils/          Yardımcılar (offline cache, rate limiter, doğrulama)
__tests__/      Birim testleri
firestore.rules Firestore güvenlik kuralları
storage.rules   Storage güvenlik kuralları
```

Kabaca 33.000 satır TypeScript; 40 ekran, 34 servis modülü, 20+ Cloud Function
ve 250+ test senaryosu.

---

## Mimari notlar

**Güvenlik sunucu tarafında.** Yetki kontrolleri istemciye bırakılmaz. Kim hangi
veriyi okuyabilir/yazabilir sorusunun cevabı 370 satırlık Firestore Security
Rules dosyasında; alan bazlı değişiklik kontrolü ve batch/transaction sonrası
durumu gören doğrulamalar içerir.

**Kritik hesaplamalar Cloud Function'da.** Oyuncu reytingi, MVP sonucu ve
istatistik toplamları istemcide hesaplanmaz — manipülasyona açık olmaması için
Firestore trigger'ları ile sunucuda üretilir.

**Zamanlanmış görevler.** Maç hatırlatmaları, MVP oylama kapanışı, itiraz süresi
dolumu ve hesap silme işlemleri Pub/Sub cron'ları ile yürür (10 dakikalık,
saatlik ve günlük).

**Kötü bağlantıya dayanıklılık.** Firestore verisi AsyncStorage üzerinde TTL'li
bir önbellek katmanından geçer; ağ kesintisinde uygulama boş ekran göstermez.
Giriş, kayıt ve davet gibi işlemlerde istemci tarafı rate limiter çalışır.

**Tek kaynaktan tema.** Tüm renkler `constants/designTokens.ts` içinde tanımlı.
Açık ve koyu tema bu token'lar üzerinden yönetilir, ekranlarda sabit renk kodu
bulunmaz.

**KVKK uyumu.** Aydınlatma metni, gizlilik politikası ve kullanım koşulları
uygulama içinde yer alır. Hesap silme talebi bekleme süresiyle çalışır; kullanıcı
süre dolmadan hesabını geri alabilir.

---

## Kurulum

Gereksinimler: Node.js 20+, npm, Expo Go (veya bir emülatör).

```bash
git clone <repo-url>
cd halisaha-app
npm install
```

Ortam değişkenlerini ayarla:

```bash
cp .env.example .env
```

`.env` dosyasını kendi Firebase projenin bilgileriyle doldur (Firebase Console →
Proje Ayarları → Web uygulaması). Uygulamayı başlat:

```bash
npm start          # Expo geliştirme sunucusu
npm run android    # Android
npm run ios        # iOS
npm run web        # Web
```

### Firebase tarafı

```bash
firebase deploy --only firestore:rules,storage:rules
cd functions && npm install && npm run deploy
```

Cloud Function'lar `europe-west1` bölgesinde çalışır; bölgeyi değiştirirsen
`firebaseConfig.ts` içindeki `FUNCTIONS_REGION` değerini de güncelle.

---

## Test

```bash
npm test               # tüm testler
npm run test:watch     # izleme modunda
npm run test:coverage   # kapsam raporu
npm run lint           # ESLint
```

Testler ağırlıklı olarak iş mantığını kapsar: takım dengeleme, reyting
hesaplama, MVP skorlama, abonelik limitleri, istatistik doğrulama, rate limiter
ve tarih yardımcıları.

---

## Geliştirme yaklaşımı

Proje, Anthropic'in **Claude Code** aracıyla yapılan AI destekli eşli programlama
ile geliştirildi. Özellikler önce teknik spesifikasyon ve uygulama planı olarak
yazıldı, ardından adım adım hayata geçirildi. AI çıktısı doğrudan kabul edilmedi;
üretim koduna girmeden önce manuel olarak incelendi ve testlerle doğrulandı.

---

## Durum

Aktif geliştirme aşamasında. Henüz mağazalarda yayında değil.
