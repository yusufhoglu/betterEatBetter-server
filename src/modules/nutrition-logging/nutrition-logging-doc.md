# Nutrition Logging Modülü — Neden Böyle Kurduk

Bu doküman `nutrition-logging`'deki kararların **neden** böyle alındığını anlatır.

---

## Neden `food-recognition`'a hiç geri dönmüyoruz

İlk sezgi "tanıma sonucunu backend'de sakla, loglarken oradan oku" olabilir — tutarlı
görünür. Ama düşünün: kullanıcı zaten elinde tam veriyle (barcode/text/search zaten
senkron döndü, photo'da da mobil sonucu okumuş durumda) — üstelik kullanıcı bunu
**düzenlemiş** olabilir (gram değiştirmiş, kalem eklemiş/çıkarmış). Backend'in
"orijinal tanıma sonucuna" geri dönmesi, hem gereksiz bir bağımlılık (`nutrition-logging`
→ `food-recognition`) yaratır hem de düzenlenmiş veriyle asıl kayıt sırasında hangisinin
"doğru" olduğu konusunda kafa karışıklığına yol açar. Mobilin gönderdiği son hal, tek
doğruluk kaynağı — basit ve net.

## Neden günlük özet "her seferinde yeniden hesapla", artımlı sayaç değil

Bu, ilk bakışta "daha az verimli" görünen ama bilinçli bir tercih. Artımlı bir sayaç
(`dailyTotal += yeniKalori`) matematiksel olarak daha "ucuz" görünüyor, ama gerçek dünyada
şu riski taşıyor: bir güncelleme yarıda kesilirse (ağ hatası, sunucu crash'i, bir bug),
sayaç gerçek veriden sapar ve bunu **fark etmek zor** — kullanıcı "toplam kalorim yanlış
görünüyor" dediğinde, geçmişe dönük hangi işlemin sayacı bozduğunu bulmak neredeyse
imkansız hale gelir.

Buna karşılık "her seferinde yeniden topla" yaklaşımı, günlük kalem sayısının küçük olması
(bir kullanıcı günde en fazla birkaç düzine kalem loglar) sayesinde **performans maliyeti
neredeyse sıfır**, ama **doğruluk garantisi mutlak** — toplam her zaman DB'deki gerçek
veriyle birebir eşleşiyor, çünkü doğrudan ondan hesaplanıyor. Bu, "biraz daha yavaş ama
asla yanlış olamaz" ile "biraz daha hızlı ama zamanla sessizce bozulabilir" arasında bir
seçim, ve sizin ölçeğinizde ilkinin maliyeti pratikte yok denecek kadar düşük.

## `MealItem` neden upsert — neden her ekleme yeni bir satır açmıyor

Bir kullanıcı kahvaltıya önce yumurta ekleyip birkaç dakika sonra ekmek eklediğinde, bunlar
mantıksal olarak **aynı öğün**. Eğer her `LogMealEntries` çağrısı yeni bir satır açsaydı,
"bugünkü kahvaltım" sorgusu birden fazla parçalı kaydı birleştirmek zorunda kalırdı —
hem sorgulama karmaşıklaşır hem de "öğünü düzenle/sil" gibi bir işlem hangi satırı
hedeflediği belirsizleşirdi. `(userId, date, mealType)` üçlüsünü tek bir satıra bağlamak,
"bir öğün = bir kayıt" sezgisini koda birebir yansıtıyor.

## `DailyTargetsPort`'un `null` dönmesi — neden hata değil

Bunu `onboarding-plan-doc.md`'de de anlatmıştık ama burada tekrar vurgulamakta fayda var:
eğer bir kullanıcı henüz hedef belirlememişse (`onboarding` tamamlanmamışsa), bu onun
"ne yediğini takip edememesi" anlamına gelmemeli. Sadece kalori sayan ama hedef koymak
istemeyen bir kullanıcı gayet makul bir senaryo. `remaining`/`goal` alanlarını `null`
bırakıp `consumed`'ı göstermeye devam etmek, uygulamayı bu kullanıcı için de kullanılabilir
tutuyor — backend'in "önce şunu tamamla, sonra devam et" diye zorlayıcı bir kapı olması
gerekmiyor.

## Outbox — neden `body-analytics` henüz yokken bu event'i yazıyoruz

Bu, ileriye dönük bir yatırım: `body-analytics` modülü kurulduğunda, bu event'leri okuyup
kendi read-model'ini (`daily_summary` gibi) güncelleyecek. Event'i şimdiden, doğru
transaction garantisiyle yazmaya başlamak, `body-analytics` geldiğinde "geçmişe dönük
event üretmemiz lazım" gibi bir taşıma sorunuyla uğraşmamızı önlüyor — event akışı baştan
doğru kurulmuş oluyor, tüketici modül ne zaman hazır olursa o zaman devreye girer.

---

## Bu modülde kod yazarken genel prensip

`nutrition-logging`, sisteminizin **en sık kullanılan** yazma yolu olacak — kullanıcılar
günde birkaç kez buraya veri gönderecek. Bu yüzden burada karmaşıklık eklemek yerine
(artımlı sayaçlar, cache'ler, önceden hesaplanmış özetler gibi "optimizasyon" görünen ama
aslında kırılganlık ekleyen şeyler), basit ve doğruluğu garanti eden bir tasarımda kalmak
bilinçli bir tercih. Performans gerçekten sorun olursa (ki kalem sayısı küçük olduğu için
olası değil), o zaman ölçüp optimize edersiniz — erken optimizasyon yapmıyoruz.
