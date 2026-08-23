# Identity Modülü — Neden Böyle Kurduk

Bu doküman `identity` modülündeki kararların **neden** böyle alındığını anlatır.
Kod detayları için `identity-rule.md`'ye bakın.

---

## Neden "hibrit" kapsam — tam iskelet, tek provider

İki uç seçenek vardı: sadece basit bir "dev login" yapıp sonra tamamen unutmak, ya da
Apple/Google entegrasyonunu da şimdi bitirmek. İkisi de yanlış hissettirdi. İlki, refresh
token rotation gibi güvenlik-kritik bir mekanizmayı "sonra eklerim" deyip unutma riski
taşıyordu — bu tür şeyler genelde bir daha hiç eklenmiyor. İkincisi ise asıl önceliğiniz olan
`food-recognition`'ı gereksiz yere geciktirecekti (Apple/Google SDK entegrasyonu, test
hesapları, sertifikalar zaman alan işler).

Bu yüzden ortada bir yol seçtik: **güvenlik mimarisinin tamamını şimdi doğru kurun** (rotation,
reuse detection, Port soyutlaması), ama **sadece bir provider'ı** (email+şifre) implemente
edin. Apple/Google eklemek istediğinizde, tek yapmanız gereken `IdentityProviderPort`'un yeni
bir implementasyonunu (`AppleSignInAdapter.ts`) yazmak — `SignIn`, `RefreshSession` gibi
use-case'lerin hiçbiri değişmeyecek.

## Neden email+şifre, OTP/magic-link değil

OTP (tek kullanımlık kod) yaklaşımı şifre yönetimini ortadan kaldırıyor, kulağa daha modern
geliyor. Ama bir email gönderim servisine (Resend, SendGrid gibi) bağımlılık ekliyor — yeni
bir Port, yeni bir Adapter, yeni bir 3. parti hesap/API key yönetimi. Şu an asıl önceliğiniz
food-recognition olduğu için, bu ek entegrasyon yükünü şimdilik almak istemedik. Email+şifre,
`argon2` dışında hiçbir dış bağımlılık gerektirmiyor — bugün yazıp bugün test edebilirsiniz.

## "Email var mı yok mu" bilgisi neden sign-up'ta serbest, sign-in'de gizli

Bu ayrımın arkasındaki mantık şu: sign-up'ta zaten kullanıcı deneyimi gereği bu bilgiyi
paylaşmak ZORUNDASINIZ ("bu email zaten kayıtlı, giriş yapmayı dener misiniz?" demeden
kullanıcı neden başarısız olduğunu anlayamaz). Sign-in'de ise bu bilginin hiçbir kullanıcı
deneyimi faydası yok — sadece bir saldırganın "bu email sistemde var mı" diye deneme yapmasını
kolaylaştırıyor. Bu yüzden sign-up'ta açık, sign-in'de kapalı bıraktık; ikisi de kendi
bağlamında doğru davranış.

**Not:** Bu, food-tracking gibi düşük-hassasiyetli bir uygulamada "mükemmel güvenlik" değil,
"makul, orantılı güvenlik" kararı. Bankacılık ya da sağlık verisi taşıyan bir sistemde çok
daha sıkı önlemler (örn. sign-up'ta bile enumeration'ı tamamen kapatmak) gerekebilirdi.

## Neden argon2, bcrypt değil

İkisi de "yeterince iyi" — ama argon2, Password Hashing Competition'ın kazananı ve modern
güvenlik tavsiyelerinin (OWASP dahil) varsayılan önerisi haline geldi. bcrypt'in tek gerçek
avantajı biraz daha yaygın olması, ama argon2'nin Node paketleri de olgun. Sizin projeniz
zaten Docker'da çalışacağı için (Python servisi için de aynı yaklaşımı konuşmuştuk), argon2'nin
native binding gerektirmesi pratikte hiç sorun çıkarmaz.

## Refresh token rotation — bunu neden atlamadık

Bunu daha önce `shared-doc.md`'de detaylıca anlatmıştık ama identity modülü özelinde tekrar
vurgulamakta fayda var: burası mimarinin **en çok "basitleştireyim" cazibesine kapılınan**
yeri. "Refresh token'ı sabit tutsam ne olur ki" demek kolay, ama mobil bir uygulamada bu
token'lar cihazda 30-90 gün yaşıyor — bir cihaz kaybı/çalıntısı durumunda, rotation olmadan
bu süre boyunca hiç fark edilmeden istismar edilebilir. Rotation + reuse detection, ekstra
birkaç saat kod yazmak karşılığında bu riski neredeyse sıfıra indiriyor. Bu, "nice to have"
değil, mobil auth'un temel bir güvenlik pratiği.

**Somut örnek:** Kullanıcının telefonu çalınıyor, saldırgan uygulamayı açık buluyor,
refresh token'ı çıkarıp kendi cihazında kullanmaya başlıyor. Rotation olmadan, gerçek
kullanıcı yeni bir cihaz alıp tekrar login olana kadar (belki hiç olmayacak, sadece
uygulamayı silecek) saldırgan sınırsız erişime sahip. Rotation ile: gerçek kullanıcı
bir sonraki normal kullanımında (token yenilendiğinde) saldırganın elindeki token
otomatik geçersiz kalıyor — ve eğer saldırgan hâlâ eski (artık geçersiz) token'ı
kullanmaya çalışırsa, bu "reuse" olarak yakalanıp tüm oturumlar iptal ediliyor.

## Access/refresh token süreleri — bunlar kesin mi

Rule dosyasında 15 dakika / 30 gün olarak belirledik ama bunlar **varsayım**, kesinleşmiş
bir ürün kararı değil — konuşmamızda bu rakamlara özel olarak karar vermedik, makul
endüstri standardı değerler olarak seçildi. Env değişkeni üzerinden kolayca
değiştirilebilir bırakıldı, koda sabit yazılmadı. Kullanıcı davranışınızı (uygulamayı ne
sıklıkla açıyorlar) gözlemledikçe bu süreleri ayarlamanız normal ve beklenen.

## Port tasarımı: neden "provider-agnostic" olmalı

`IdentityProviderPort`'u email+şifreye özel dar bir arayüz olarak tasarlarsak (örneğin
`verifyPassword(email, password)`), Apple/Google eklemek istediğinizde bu arayüz işe
yaramaz, yeni bir Port daha açmanız gerekir — bu da `SignIn` use-case'inin Apple/Google
için ayrı bir versiyonu anlamına gelir. Bunun yerine daha soyut bir sözleşme
(`verify(credentials): Promise<{ externalId, email }>`) kurarsak, email+şifre de
Apple/Google de aynı şekli döndürüyor — use-case'ler provider'dan habersiz kalıyor.
Bu, tam olarak Port/Adapter ayrımının kazandırması gereken şey: bugünkü kod, yarınki
genişlemeyi zaten öngörüyor.

---

## Bu modülde kod yazarken genel prensip

`identity`, sistemin **güven temeli** — burada yapılan bir gevşeklik (enumeration,
zayıf hashleme, rotation'sız refresh token) tüm diğer modüllerin güvenliğini de baltalar,
çünkü hepsi "kullanıcı gerçekten kim olduğunu kanıtladı" varsayımına dayanıyor. Diğer
modüllerde "şimdilik basit tutalım, sonra düzeltiriz" demek daha kabul edilebilirken,
burada bu tavrı önerilmiyoruz.
