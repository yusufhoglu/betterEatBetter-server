# Claude Code Prompt — `identity` Modülüne Test Ekleme

Bu prompt, `src/modules/identity/` zaten implemente edilmiş (çalışıyor) durumdayken,
sadece test ekleme turu için kullanılır. `identity-rule.md`'nin güncellenmiş halini
(sonuna eklenen "Test Stratejisi" bölümü dahil) aynı klasöre koyup referans ver.

---

## PROMPT

```
src/modules/identity/ modülü zaten implemente edilmiş ve çalışıyor. Bu turda SADECE
test ekleyeceğiz, mevcut iş mantığı kodunu DEĞİŞTİRME (bir test yazarken gerçek bir bug
bulursan, bunu düzelt ama önce "böyle bir sorun buldum" diye rapor et, sessizce büyük
değişiklik yapma).

Aynı klasördeki identity-rule.md dosyasını oku, sonundaki "Test Stratejisi" bölümündeki
TÜM testleri yaz. Şu ikisi özellikle kritik, atlama:
1. SignIn enumeration testi — "email yok" ve "şifre yanlış" durumlarının AYNI hatayı
   döndürdüğünü doğrulayan test.
2. RefreshSession reuse detection testi — kullanılmış bir token tekrar gönderildiğinde
   kullanıcının TÜM refresh token'larının iptal edildiğini doğrulayan test.

Test altyapısı standardı: **testcontainers** (identity-rule.md'de detaylandırılan
"env/modül singleton zamanlama" nüansına dikkat et — container'ı beforeAll içinde
başlatıp env set ettikten SONRA, prisma/ilgili modülleri dinamik `await import(...)`
ile yükle, aksi halde food-recognition modülünde daha önce yaşanan "worker yanlış
Redis'e/DB'ye bağlanmaya çalışır" hatasının aynısına düşersin).

Test dosyaları kaynağın yanında durur (`X.ts` + `X.test.ts` ya da `.integration.test.ts`),
ayrı bir `__tests__/` ağacında değil.

Testleri yaz, ÇALIŞTIR (npm run test:unit, npm run test:integration — integration için
Docker gerekiyorsa dene, çalışmıyorsa ortam kısıtını raporla), başarısız olanları düzelt.

**Integration testleri ATLAMA.** Daha önceki bir turda "repoda zaten integration test
konvansiyonu yok" gerekçesiyle bu testler atlanmıştı — bu YANLIŞ bir gerekçeydi, çünkü
food-recognition modülünde zaten `.integration.test.ts` dosyaları (testcontainers ile)
mevcut ve bu, üzerinde anlaşılmış standart. `PrismaUserRepository`,
`PrismaRefreshTokenRepository` (shared/auth/refreshTokenService.ts'e delege ediyor olsa
bile, gerçek Postgres'e karşı davranışının doğrulanması hâlâ gerekli), ve
`JwtSessionTokenAdapter` için testcontainers tabanlı GERÇEK integration testleri yaz.

**Ayrıca şu iki soruyu araştır ve tamamlama raporunda ayrı bir başlık altında cevapla:**
1. Repoda daha önce fark edilen bir `shared/config/env.ts` sorunu var: bu dosya import
   anında `process.env`'i parse ediyor (fail-fast), bu da gerçek env değişkenleri
   olmadan HERHANGİ bir test dosyasının import zamanında çökmesine yol açabiliyor.
   Bunun repoda halen bir sorun olup olmadığını, `jest.setup.ts`/`jest.config.js`'te
   zaten bir fallback/test-env mekanizması olup olmadığını kontrol et, yoksa ekle.
2. Repoda `test.todo` olarak bırakılmış, hiç implemente edilmemiş test var mı (varsa
   kaç tane, hangi dosyalarda)? Bunlar identity modülüne aitse tamamla; başka modüllere
   aitse SADECE listele, dokunma (bu prompt sadece identity için).

Eğer `RefreshToken` rotation/reuse-detection mantığının `shared/auth/` içinde yaşadığını
(identity modülünün ince bir wrapper/adapter olarak ona delege ettiğini) görürsen, bu
BİLİNÇLİ bir mimari karar (JWT secret/algoritma tutarlılığı ve tek doğruluk kaynağı için)
— bunu YENİDEN YAZMAYA ÇALIŞMA, olduğu gibi kabul edip üzerine test yaz.

---

## Tamamlama Raporu (İŞİN SONUNDA BUNU DOLDUR)

İşin bitince aşağıdaki formatta bir özet yaz:

### 1. Ne yapıldı
(Hangi test dosyaları eklendi, kısaca ne test ediyor)

### 2. Rule dosyasındaki hangi kurallara karşılık geldiği
(Her test grubu için: identity-rule.md'nin hangi maddesini doğruluyor)

### 3. Karşılaşılan/düzeltilen sorunlar
(Test yazarken mevcut kodda bir hata/eksik bulundu mu, bulunduysa ne, nasıl düzeltildi
— eğer iş mantığına dokunulduysa bunu AÇIKÇA belirt)

### 4. Test sonuçları
(Hangi komut çalıştırıldı, kaç test/suite geçti, çalıştırılamayan varsa neden — örn.
Docker yoksa bunu açıkça yaz)

### 5. Rule/Prompt'tan bilinçli sapma var mı
(Varsa hangi maddeden neden saptığını yaz; yoksa "yok" yaz)

Sadece src/modules/identity/ içine dokun, başka hiçbir modüle dokunma.
```
