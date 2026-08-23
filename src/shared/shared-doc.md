# Shared Katmanı — Neden Böyle Kurduk

Bu doküman `src/shared/` altındaki her kararın **neden** böyle alındığını anlatır.
Kod nasıl yazılacağını `shared-rule.md`'de bulabilirsiniz — burada amaç "bu karar nereden
geliyor, hangi alternatif elendi, ben bu katmanda kod yazarken neye dikkat etmeliyim" sorularına
cevap vermek.

---

## Hata yönetimi: neden tek bir "Error" sınıfı yetmiyor

Bir hatayı hem HTTP'ye doğru status kodla çevirmek hem de "bu spesifik olarak ne" bilgisini
taşımak istiyoruz. Sadece `throw new Error("bir şeyler ters gitti")` dersek, controller'da
bunu yakalayıp doğru HTTP kodunu seçmek imkansız hale gelir.

Bu yüzden az sayıda genel sınıf (`ValidationError`, `NotFoundError` vb.) var — her biri
kendi HTTP kodunu biliyor. Ama her sınıfın içinde ayrıca bir `code` string'i taşıyoruz
(örn. `IMAGE_UNREADABLE`). Neden ikisi birden? Çünkü mobil taraf bazen sadece "400 Bad
Request" bilmek istemiyor, **hangi** 400 olduğunu bilmek istiyor — "fotoğraf okunamadı"
ile "eksik alan var" ikisi de 400 ama kullanıcıya gösterilecek mesaj tamamen farklı.

**Dikkat edin:** Yeni bir hata durumu eklerken önce "bu hangi genel kategoriye giriyor"
diye düşünün (400 mü, 404 mü, 409 mu), sonra o kategorinin altına kendi `code`'unuzu
ekleyin. Yeni bir sınıf açmayın, mevcut taksonomiyi genişletin.

## Rate limiting neden merkezi

İlk aklımıza gelen, her modülün kendi rate limit mantığını yazması oldu — chatbot mesaj
sınırlar, identity login denemesini sınırlar. Ama ikisi de aslında aynı matematiği yapıyor
(bir zaman penceresinde kaç istek geldi say, aştıysa reddet). Bunu tek yerde yazıp her
modülün sadece "hangi anahtar, kaç istek, hangi süre" sorusuna cevap vermesini istedik.

**Pratik sonucu:** Rate limit eklemeniz gerektiğinde `rateLimiter.ts`'e yeni kod yazmıyorsunuz,
sadece kendi modülünüzde `checkRateLimit('sizin-anahtarınız', limit, pencere)` çağırıyorsunuz.

## Neden bir DI container kullanmıyoruz

Bu bilinçli bir tercih, "henüz düşünmedik" değil. DI container'lar (tsyringe, awilix gibi)
bağımlılıkları otomatik çözer ama bunun bedeli, bir sınıfın bağımlılıklarının nereden
geldiğini anlamak için container konfigürasyonuna bakmanız gerekmesi. Küçük bir ekipte ve
Claude Code ile kod üretilen bir projede, "her şey açıkça görünür" prensibinin kazancı,
container'ın kısalttığı birkaç satır koddan daha değerli. `new X(y, z)` yazdığınızda hem
siz hem AI, `X`'in neye ihtiyaç duyduğunu direkt kodun kendisinde görüyorsunuz.

## Auth: neden refresh token'ı "rotate" ediyoruz

Basit bir soru sorarak başlayalım: bir refresh token çalınırsa (kullanıcının telefonu
kaybolur, jailbreak edilmiş bir cihazda sızıntı olur), saldırgan bununla ne kadar süre
kötüye kullanabilir? Rotation olmadan, cevap "token'ın süresi dolana kadar" — bu 30-90 gün
olabilir. Rotation ile, cevap "bir sonraki meşru kullanıcı girişine kadar" — çünkü kullanıcı
uygulamayı açıp yeni bir refresh token aldığı an, saldırganın elindeki eski token geçersiz
kalır. Reuse detection ise bir alarm zili gibi çalışır: eğer geçersiz kılınmış bir token
tekrar kullanılmaya çalışılırsa, bu "birisi çalıntı bir token'la deniyor" sinyali — o anda
kullanıcının tüm oturumlarını iptal ediyoruz.

## Config: "fail-fast" ne demek, neden önemli

Hayal edin: `RAG_SERVICE_URL` env değişkenini yanlış yazmışsınız (`RAG_SERVICE_UR`).
Bu değişkeni sadece kullanıldığı yerde kontrol ederseniz, uygulama sorunsuz başlar,
saatlerce çalışır, ta ki bir kullanıcı fotoğraf yükleyene kadar — o anda "undefined is
not a valid URL" gibi anlaşılması zor bir hatayla karşılaşırsınız, production'da, gece
yarısı. Fail-fast, bunun yerine uygulamayı **hiç başlatmıyor**, deploy anında net bir
hata veriyor: "RAG_SERVICE_URL eksik/geçersiz." Kötü haberi erken almak, iyi haberdir.

## Circuit breaker: gerçekten lazım mı

Bu soruyu biz de sorduk. Kısa cevap: Python RAG servisi çöktüğünde/yavaşladığında, circuit
breaker olmadan her istek 60 saniye boyunca boşuna bekler — worker'larınız meşgul ama hiçbir
iş ilerlemez, kuyruk şişer. Breaker, birkaç ardışık hatadan sonra "bu servise şu an gitmenin
anlamı yok" diyip anında kullanıcıya "manuel giriş yapın" alternatifini sunuyor. Maliyeti
düşük (cockatiel sayesinde birkaç satır), kazancı somut, o yüzden ekledik.

## Trace ID: en kolay unutulan kural burada

`AsyncLocalStorage` sayesinde trace_id'yi fonksiyondan fonksiyona elle taşımak zorunda
değilsiniz — bir kere HTTP isteğinin başında kuruluyor, sonrasında her `logger.info(...)`
çağrısı otomatik olarak taşıyor. **Ama** bu otomasyon, sadece orijinal request zincirinin
**içinde** kaldığı sürece işliyor. Bir job kuyruğa düşüp bir worker tarafından **daha sonra**
işlendiğinde, bu yeni bir "async context" — trace_id'yi worker'ın en başında **elle**
yeniden kurmazsanız, o worker'ın tüm logları trace_id'siz, yani izlenemez hale gelir. Bunu
`createWorker` fonksiyonunun otomatik yapmasını sağladık ki her yeni job dosyasını yazan kişi
bunu hatırlamak zorunda kalmasın — ama eğer ileride cron job veya event handler gibi yeni bir
"async başlangıç noktası" eklerseniz, orada da aynı kuralı uygulamayı unutmayın.

## Queue: `jobId`'yi neden rastgele değil, deterministik seçtik

Senaryo: kullanıcı fotoğraf yüklüyor, ağ hatası oluyor, mobil uygulama otomatik retry
yapıyor. Rastgele job id kullansaydık, bu iki ayrı job olarak kuyruğa girer, Python'a
iki kez istek gider — hem maliyet hem kullanıcıya çift bildirim riski. `jobId`'yi
`mealPhotoId` yaptığımızda, BullMQ aynı id ile ikinci bir job eklenmeye çalışıldığında
otomatik olarak yok sayıyor — sıfır ekstra kod ile bu sorunu çözmüş oluyoruz.

**Önemli ayrım:** kullanıcı "sonucu beğenmedim, tekrar çekeyim" dediğinde bu YENİ bir
fotoğraf, dolayısıyla yeni bir `mealPhotoId` — idempotency burada devreye girmiyor, doğru
şekilde ayrı bir iş olarak işleniyor. Idempotency sadece "aynı isteğin" tekrarında koruma
sağlıyor, kullanıcının bilinçli yeni eylemlerini engellemiyor.

## Storage: neden mobil doğrudan R2'ye yüklüyor, Node üzerinden değil

Eğer fotoğraf önce mobilden Node'a, sonra Node'dan R2'ye gitseydi, aynı veri ağdan iki kez
geçerdi — hem daha yavaş hem Node'un kaynaklarını (bellek, bant genişliği) gereksiz yere
meşgul ederdi. Bunun yerine mobil, Node'dan sadece "buraya yükleyebilirsin" diyen imzalı bir
URL alıyor ve doğrudan R2'ye yüklüyor. Node hiçbir zaman görselin kendisini görmüyor, sadece
küçük JSON mesajlarla koordinasyon yapıyor.

### "Copy" mi "Move" mu — burada gerçek bir hata payı vardı

İlk düşüncemiz "dosyayı geçici klasörden kalıcı klasöre taşı (move = kopyala + sil)"ydı.
Ama şunu fark ettik: worker'lar meşgulse, bir job kuyrukta birkaç saniye/dakika bekleyebilir.
Eğer taşıma işlemi (hızlı) analiz işleminden (yavaş, kuyrukta bekleyebilir) önce biterse ve
orijinal dosyayı silerse, analiz job'ı çalıştığında dosya artık orada olmayabilir — 404 hatası.
Çözüm basit: silmek yerine **kopyalamak**. Geçici klasördeki dosya, R2'nin kendi "lifecycle
rule"u ile zaten 24 saat sonra otomatik siliniyor, elle silmemize hiç gerek yok. Bu, "hız
kazanalım derken veri kaybı riski yaratmayalım" dengesinin somut bir örneği.

## Logger: `redact` neden "hatırlanacak bir şey" değil, "sistem garantisi" olmalı

Bir geliştiricinin "şifreyi loglamayayım" diye her seferinde hatırlamasına güvenmek,
er ya da geç birinin bunu unutup bir token'ı düz metin loglamasıyla sonuçlanır — bu bir
güvenlik açığı. Bunun yerine `logger.ts` içinde bir kere, global bir redact listesi
tanımlıyoruz (`password`, `accessToken`, `refreshToken`, `Authorization`). Bu, "iyi niyetle
hatırlamaya çalışmak" yerine "sistem zaten engelliyor" güvencesi sağlıyor.

## Metrics: neden bu beş metrik özellikle önemli

Sisteminizin en büyük riski çok sayıda dış entegrasyon (Python RAG, LLM, barkod API).
Bir şey yavaşladığında ilk sorulan soru hep aynı: "bizim tarafımızda mı, yoksa dış
serviste mi?" `integration_call_duration_seconds` + `circuit_breaker_state` ikilisi bu
soruya saniyeler içinde cevap veriyor — breaker açıksa ve dış çağrı süresi uzunsa, sorun
kesin dışarıda. `nutrition_low_confidence_total` ise farklı bir amaca hizmet ediyor: bu bir
altyapı metriği değil, bir ürün/model kalite göstergesi — RAG modelinin ne sıklıkla
"emin değilim" dediğini izlememizi sağlıyor.

---

## Bu katmanda kod yazarken genel prensip

`shared/` içindeki her şey **birden fazla modül tarafından kullanılacak** demek —
burada yapılan bir hata ya da eksik düşünülmüş bir karar, tek bir modülü değil **hepsini**
etkiler. Yeni bir şey eklerken kendinize şunu sorun: "bu gerçekten her modülün ihtiyacı mı,
yoksa sadece bir modülün mü?" Cevap "sadece bir modül" ise, o kod muhtemelen burada değil,
o modülün kendi `domain/` veya `adapters/` klasöründe yaşamalı.
