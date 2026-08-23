# Food Recognition Modülü — Neden Böyle Kurduk

Bu doküman `food-recognition` modülündeki kararların **neden** böyle alındığını anlatır.
Kod detayları için `food-recognition-rule.md`'ye bakın.

Bu, sistemin kalbi — hem en çok dış entegrasyon taşıyan hem de tek asenkron akışı olan
modül. Diğer modüllere göre burada hata payı daha pahalı, o yüzden testlere özellikle
önem verdik (aşağıda ayrı bir bölüm var).

---

## Neden confidence artık "binary" — threshold kararından neden vazgeçtik

İlk tasarımda "Node'da bir eşik değeri tutalım, A/B test edelim" demiştik — kulağa esnek
geliyordu. Ama gerçek şu: RAG sisteminin doğası zaten "ya eşleşen yeterli veri buldum ya da
bulamadım" — sürekli ayarlanabilir bir "gri alan" değil. Python zaten bu kararı üretim
mantığının bir parçası olarak veriyor. Node'da ayrıca bir eşik tutmak, olmayan bir esnekliği
var gibi göstermek olurdu. Gerçekçi olan, Python'un verdiği binary sinyali olduğu gibi
kabul etmek. İleride RAG modeliniz gerçekten sürekli bir güven skoru üretmeye başlarsa
(örneğin her item için ayrı bir yüzde), `ConfidencePolicy`'yi genişletmek tek bir dosyada
kalan bir değişiklik — bugünkü basitlik, yarınki esnekliği kapatmıyor.

## Neden barcode/text/search sonucu backend'de saklanmıyor

Sezgisel olarak "her tanıma sonucunu kaydedelim, tutarlı olsun" demek cazip. Ama düşünün:
kullanıcı barkod taradığında sonuç zaten anında (birkaç yüz ms içinde) response'ta dönüyor.
Kullanıcı bunu loglamaya karar verirse, elindeki veriyi zaten `nutrition-logging`'e
gönderebilir — backend'in araya girip "önce ben kaydedeyim, sonra sen onu okuyup tekrar
gönder" demesinin hiçbir faydası yok, sadece gereksiz bir DB yazma-okuma turu ekliyor.

Photo farklı çünkü **asenkron** — kullanıcı fotoğrafı gönderdiğinde sonuç o an yok, birkaç
saniye/dakika sonra hazır oluyor. Bu süre boyunca sonucun bir yerde durması ZORUNLU (worker
onu yazacak, mobil onu daha sonra okuyacak ya da push bildirimiyle haberdar olacak). Bu
yüzden `FoodEntryRepositoryPort` sadece photo akışına ait — diğer üçünün buna ihtiyacı yok,
eklemek gereksiz karmaşıklık olurdu.

## USDA verisini neden canlı API yerine kendi veritabanımıza aktarıyoruz

`SearchFoodCatalog`'un kullanım şeklini düşünün: kullanıcı klavyede yazarken anlık sonuç
görmek istiyor (autocomplete gibi). Her tuşa basışta harici bir API'ye gitmek hem gecikme
(100-300ms+ her sorguda) hem rate limit riski (USDA'nın kendi kotaları var) demek. Oysa
USDA verisi kamu malı ve indirilebilir — bir kere kendi veritabanınıza aktarırsanız, arama
milisaniyeler sürer, hiçbir dış bağımlılık taşımaz, rate limit diye bir şey olmaz. Verinin
sık değişmemesi (besin değerleri yılda birkaç kez güncellenir, günlük değil) bu importu
düşük bakımlı kılıyor — ayda/birkaç ayda bir yeniden senkronize etmek yeterli.

## "Copy, move değil" kuralı burada neden özellikle kritik

Bu kararı `shared-doc.md`'de genel olarak anlatmıştık ama food-recognition'da somut bir
şekilde karşımıza çıkıyor: worker'larınız Python'un kapasitesine göre sınırlı (concurrency
düşük tutuluyor ki Python'u boğmayalım). Bu, bir job'ın kuyrukta biraz bekleyebileceği
anlamına geliyor. Eğer dosya taşıma (move) işlemi bu bekleme süresinden önce bitip orijinali
silerse, analiz job'ı sıraya geldiğinde artık var olmayan bir dosyayı Python'a göstermeye
çalışır — 404. Kopyalama ile bu risk ortadan kalkıyor, `pending/` kopyası zaten kendi
kendine (lifecycle rule ile) temizleniyor.

## Rate limit sayıları nereden geliyor

Bunlar kesin bilimsel hesaplar değil, **maliyet + gerçekçi kullanım** dengesine dayalı
başlangıç noktaları: `photo` en pahalı (RAG çağrısı) olduğu için en düşük limit (5/dk).
`barcode` ucuz (cache'lenebilir, harici API basit) olduğu için daha yüksek (10/dk).
`text` de LLM çağrısı taşıyor ama muhtemelen kullanıcı bir öğünde birkaç kalemi hızlıca
yazacağı için barcode ile aynı seviyede tuttuk (10/dk). `search` limitsiz çünkü tamamen
kendi veritabanınızda, harici maliyet yok. Gerçek kullanım verisi geldikçe bu sayılar
ayarlanmalı — koda sabit değil, env değişkeni olarak tutulmalı ki deploy gerektirmeden
değiştirilebilsin.

---

## Testler neden bu kadar önemli, özellikle bu modülde

Bu modülün üç özelliği onu diğerlerinden daha riskli kılıyor:

1. **En çok dış entegrasyon** (Python RAG, Open Food Facts, LLM, kendi arama indexiniz) —
   her biri kendi başarısızlık moduna sahip, hepsinin doğru davrandığını manuel test etmek
   pratik değil.
2. **Tek asenkron akış** — bir hatanın etkisi anında görünmüyor, saatler sonra "neden bazı
   fotoğraflar hiç işlenmedi" diye fark edilebiliyor. Testler, bu tür gecikmeli hataları
   geliştirme anında yakalıyor.
3. **En kritik iş mantığı** (idempotency, confidence policy, negative cache, race condition
   koruması) — bunların hepsi "gözle bakınca doğru görünen ama ince bir durumda yanlış
   davranan" türden kod. Testler olmadan, altı ay sonra bir başkası (ya da siz) bu koda
   dokunduğunda hangi davranışın bilinçli bir tasarım kararı olduğunu, hangisinin kaza
   eseri çalıştığını ayırt edemez.

**Somut fayda:** Örneğin `RedisBarcodeCache`'in negative cache testi olmasaydı, biri
ileride "kod sadeleştireyim" deyip `'NOT_FOUND'` sentinel değerini `null` ile birleştirse,
hiçbir şey görsel olarak bozulmaz — ama negative caching'in tüm amacı (harici API'yi
gereksiz sorgulamamak) sessizce ortadan kalkar, siz fark etmeden. Test, bu tür sessiz
regresyonları yakalayan tek güvenlik ağı.

**Bu modülü genişletirken** (yeni bir tanıma yöntemi eklemek, RAG modelini değiştirmek,
yeni bir barkod kaynağı eklemek gibi) yeni kod yazmadan önce mevcut testleri çalıştırın —
eğer bir şey kırılıyorsa, bu ya kasıtlı bir davranış değişikliğidir (o zaman testi
güncelleyin) ya da gerçek bir regresyondur (o zaman kodu düzeltin). Testin kendisi hangisi
olduğuna karar vermez, ama sizi "bir şey değişti, buna bakmalısın" diye uyarır — bu uyarı
olmadan, sessiz regresyonlar production'a kadar fark edilmeyebilir.
