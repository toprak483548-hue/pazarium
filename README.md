# Vitrinova — ilan platformu başlangıç projesi

Vitrinova, Türkiye'de kullanılabilecek çok kategorili bir ilan platformu için hazırlanmış, sunucu tarafında HTML üreten (SEO dostu) bir başlangıç projesidir. Tasarım ve marka dili özgündür; başka bir ilan sitesinin marka varlıklarını veya birebir arayüzünü kopyalamaz.

## Bu sürümde neler var?

- Responsive ana sayfa, kategori sayfaları ve ilan kartları
- Kelime, kategori, şehir ve fiyat aralığı ile arama/filtreleme
- SEO dostu ilan adresleri: `/ilan/123/ilan-basligi`
- Hesap oluşturma, giriş/çıkış, şifre hashleme
- İlan oluşturma, hesabımdaki ilanları listeleme ve kaldırma
- Favorilere ekleme/çıkarma
- İlan bildirme formu
- PostgreSQL şeması ve indeksler
- PostgreSQL üzerinde oturum saklama
- `robots.txt`, dinamik `sitemap.xml`, canonical URL ve sayfa meta etiketleri
- Temel güvenlik başlıkları, CSRF koruması ve giriş/ilan formu hız sınırlaması
- Render Blueprint dosyası (`render.yaml`)

## Bu sürümde henüz olmayanlar

Bu bir ilk sürüm/MVP iskeletidir; Sahibinden ölçeğinde tamamlanmış bir ürün değildir. Kullanıcıların cihazından doğrudan görsel dosyası yükleme, e-posta doğrulama/şifre sıfırlama, yönetici moderasyon paneli, ilan düzenleme, gelişmiş mesajlaşma, ödeme/kargo, otomatik dolandırıcılık analizi, yedekleme planı ve hukuken gözden geçirilmiş işletme metinleri henüz ekli değildir. Canlı yayından önce özellikle moderasyon, iletişim yöntemi, hesap/veri silme süreci ve hukuki metinler tamamlanmalıdır.

**Ödeme veya kargo hizmeti yoktur.** İlan sahipliği ve ürün durumu kullanıcı tarafından doğrulanmalıdır. Gizlilik ve kullanım sayfaları başlangıç taslağıdır; hukuki danışmanlığın yerine geçmez.

---

## 1. Ücretsiz altyapı

- **Kod ve sürüm geçmişi:** GitHub
- **Web uygulaması:** Render Free Web Service
- **Veritabanı:** Neon Free PostgreSQL (Supabase kullanılmıyor)
- **Geliştirme:** Node.js 20 veya üstü

Ücretsiz planlar sınırlarla gelir; “ücretsiz” olması sınırsız veya üretim ortamı için garantili olduğu anlamına gelmez. Render ücretsiz web servisleri boşta 15 dakika kaldığında uykuya geçebilir ve yeniden açılışta ilk yanıt gecikebilir. Render'ın ücretsiz Postgres veritabanları 30 gün sonra sona erdiğinden bu proje Render Postgres kullanmaz. Neon'un ücretsiz planında da hesap/kullanım sınırları vardır. Trafik büyürse limitleri izlemek, düzenli yedek almak ve ücret ödemeden önce mimariyi yeniden değerlendirmek gerekir.

Resmî kaynaklar:
- Render ücretsiz katman sınırları: https://render.com/docs/free
- Render ücretsiz servis davranışı: https://render.com/docs/faq
- Neon Free plan sınırları: https://github.com/neondatabase/website/blob/main/content/faqs/free-plan-limits-and-quotas.md
- Google Search Central site haritası: https://developers.google.com/search/docs/crawling-indexing/sitemaps/overview

## 2. GitHub'a yükleme

1. Bu ZIP dosyasını bilgisayarında çıkar. İçindeki `vitrinova` klasörünün **içeriğini** GitHub deposunun köküne yükle; ZIP'in kendisini tek dosya olarak yüklemek yeterli değildir.
2. GitHub'da yeni bir depo oluştur. Örnek isim: `vitrinova`. Depoyu ilk yükleme için boş bırakmak işleri kolaylaştırır.
3. Tercihen GitHub Desktop veya Git kullanarak klasörün tamamını depoya gönder. Git kullanıyorsan komutlar:

   ```bash
   cd vitrinova
   git init
   git add .
   git commit -m "İlk Vitrinova sürümü"
   git branch -M main
   git remote add origin https://github.com/KULLANICI_ADIN/vitrinova.git
   git push -u origin main
   ```

4. GitHub'da `.env` dosyası olmadığını kontrol et. **Veritabanı adresi, şifre ve gizli anahtarları GitHub'a koyma.** `.env.example` sadece örnektir ve gerçek sır içermemelidir.

> Yalnızca telefondan yükleme yapıyorsan klasör yapısını ve çok sayıda dosyayı oluşturmak masaüstüne göre daha zahmetlidir. Bu durumda en sağlam yol önce ZIP'i cihazda çıkarmak ve dosyaları klasörleriyle birlikte GitHub'a gönderebilen bir Git istemcisi kullanmaktır. Render'a ZIP değil, kaynak kodun GitHub deposu bağlanacaktır.

## 3. Neon PostgreSQL oluşturma (Supabase yok)

1. https://neon.tech adresinde ücretsiz bir hesap/proje oluştur.
2. Proje oluşturulunca **Connect** bölümünden Node.js için PostgreSQL bağlantı adresini kopyala. Uygulama sunucusunda bağlantı kullanımını sınırlamak için Neon'un önerdiği pooled bağlantı adresini tercih et.
3. URL'nin `sslmode=require` parametresi içerdiğini kontrol et. Bağlantı adresi bir parola içerdiği için bunu herkese açık paylaşma ve GitHub'a commit etme.
4. Render'a geçerken bu adresi `DATABASE_URL` adlı ortam değişkenine koyacağız. Tablolar uygulama ilk açıldığında `sql/schema.sql` içeriğinden oluşturulur.

## 4. Render'da yayına alma

1. https://render.com adresine GitHub hesabınla giriş yap.
2. **New → Blueprint** seçip `vitrinova` deposunu bağla. Render depodaki `render.yaml` dosyasını algılamalıdır.
3. Render `DATABASE_URL` istediğinde Neon bağlantı adresini yapıştır. `SESSION_SECRET` Render tarafından otomatik oluşturulur. Bunu kendin üretmen gerekiyorsa en az 32 karakterlik rastgele bir değer kullan.
4. Yayın işlemini başlat. İlk deploy loglarında `Vitrinova ... portunda çalışıyor.` benzeri bir satır görmelisin.
5. Render'ın verdiği `https://...onrender.com` adresini aç. İlk açılışın ücretsiz planda yavaş olabileceğini unutma.
6. `https://SENIN-SITE-ADRESIN/health` adresi `{"ok":true,"database":"connected"}` benzeri bir yanıt vermelidir.
7. Deploy başarısızsa Render → **Logs** bölümündeki ilk hata satırını kopyala. Sıklıkla neden `DATABASE_URL` eksik/yanlış olması, bağlantı adresinde TLS parametresi olmaması veya environment değişkeninin yanlış girilmesidir.

`render.yaml`, `main` dalına gönderilen commit'lerin otomatik deploy edilmesini ayarlar. Kod güncellemesi için GitHub'a commit/push etmek yeterlidir; deploy loglarını yine kontrol et.

## 5. Yerelde çalıştırma (isteğe bağlı)

Node.js 20+ ve bir Neon veritabanı bağlantısına ihtiyacın var.

```bash
cp .env.example .env
# .env içinde DATABASE_URL ve SESSION_SECRET değerlerini düzenle
npm install
npm run dev
```

Ardından `http://localhost:3000` adresini aç. `.env.example` içindeki `SEED_DEMO_DATA=true` yalnızca yerel test için örnek ilanlar ekler. Bu değişkeni Render ortamına ekleme; örnek ilanlar gerçek ilan gibi Google'da görünmemelidir. Yerel ortamda örnek veri istemiyorsan bu satırı `false` yapabilirsin.

## 6. Google Search'te görünür hale getirme

Google'da görünmek otomatik olarak garanti edilemez. Yayına aldıktan sonra:

1. https://search.google.com/search-console/about üzerinden alanı veya URL önekini Search Console'a ekle.
2. Mülkiyet doğrulamasını tamamla. Render alt alan adında kendi DNS kaydını yönetemeyeceğin için Google'ın sunduğu uygun URL-prefix doğrulamasını kullan.
3. Search Console → **Site haritaları** bölümüne `https://SENIN-SITE-ADRESIN/sitemap.xml` gönder.
4. `https://SENIN-SITE-ADRESIN/robots.txt` dosyasını ve birkaç gerçek ilan URL'sini açıp kontrol et.
5. Search Console'da URL denetimi ile ana sayfayı ve gerçek bir ilanı test et. İndeksleme isteği göndermek indekslenme veya sıralama garantisi değildir.
6. Gerçek ilanlarda her başlık, açıklama ve görsel özgün olmalı. Örnek içerikleri canlıda açma; boş sayfalara anahtar kelime doldurma veya çok sayıda kopya/otomatik içerik oluşturma.

Bu uygulama HTML'yi sunucuda ürettiği için temel ilan içeriği tarayıcıda JavaScript çalışmadan da görülebilir. Sitemap, canonical, meta açıklamaları ve kategori URL'leri başlangıçta hazırdır.

## 7. Güvenlik ve canlıya çıkmadan önce

- Render ortamında `NODE_ENV=production`, `DATABASE_URL` ve `SESSION_SECRET` doğru olmalı.
- Gerçek kullanıcıları davet etmeden önce ilanları incelemek/gizlemek için yönetici moderasyon akışı ekle.
- Hesap silme, kişisel veri talepleri, e-posta doğrulama, şifre sıfırlama ve yedekleme süreci tanımla.
- KVKK aydınlatma metni, çerez/mahremiyet metni, kullanım koşulları, işletmeci iletişim bilgileri ve mevzuat kapsamını hukuki destekle tamamla. Siteyi işleten kişi/şirket ve iş modeline göre uygulanacak yükümlülükler değişebilir.
- Bu sürümde dosya yükleme yoktur; yalnızca HTTPS görsel URL'si alanı vardır. İleride gerçek dosya yükleme eklenecekse kalıcı ve erişim kontrollü nesne depolaması, dosya tipi/boyut denetimi ve görsel moderasyonu gerekir.
- Kullanıcı sayısı artınca Neon/Render kaynak sınırlarını, veritabanı yedeklerini, hata günlüklerini ve güvenlik raporlarını düzenli kontrol et.

## Dosya yapısı

```text
vitrinova/
├── server.js
├── db.js
├── package.json
├── render.yaml
├── .env.example
├── .gitignore
├── README.md
├── sql/
│   └── schema.sql
├── lib/
│   ├── categories.js
│   └── helpers.js
├── public/
│   ├── css/styles.css
│   ├── js/app.js
│   └── favicon.svg
└── views/
    ├── home.ejs
    ├── listings.ejs
    ├── listing-detail.ejs
    ├── login.ejs
    ├── register.ejs
    ├── new-listing.ejs
    ├── dashboard.ejs
    ├── favorites.ejs
    ├── static-page.ejs
    ├── error.ejs
    └── partials/
        ├── head.ejs
        ├── header.ejs
        ├── footer.ejs
        ├── flash.ejs
        └── listing-card.ejs
```
