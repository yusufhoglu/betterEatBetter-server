# Daily Tracking Modülü — Neden Böyle Kurduk

Bu doküman `daily-tracking`'deki kararların **neden** böyle alındığını anlatır.

---

## Neden bu modülün kendi tablosu yok

`daily-tracking`, aslında yeni bir veri üretmiyor — sadece `nutrition-logging`'in
zaten sahip olduğu veriyi (hangi öğünler loglanmış) farklı bir açıdan yorumluyor
(streak, tamamlanma haritası). Ayrı bir tabloda "gün tamamlandı mı" gibi bir bayrak
tutmak, bu bilginin `nutrition-logging`'deki gerçek veriyle **senkron kalması**
sorumluluğunu size yükler — biri güncellenirken diğeri unutulursa tutarsızlık çıkar.
Bunun yerine bu modülü tamamen **türetilmiş/hesaplanan** bir görünüm olarak tasarladık
— her zaman `nutrition-logging`'in o anki gerçek verisinden hesaplanıyor, "kendi
gerçeğini" hiç saklamıyor. Bu, `nutrition-logging`'de benimsediğimiz "her seferinde
yeniden hesapla" felsefesinin doğal bir uzantısı.

## Neden `DefineDayCompletion` ayrı bir dosya, `ComputeStreak`'in içinde değil

"Gün tamamlandı" tanımı bir **ürün kararı** — bugün "üç ana öğün" iken, kullanıcı
geri bildirimi sonrası "kalori hedefine ulaşıldıysa" ya da "herhangi bir şey
loglandıysa" gibi bir kurala dönüşebilir. `ComputeStreak` ise saf bir **algoritma**
(art arda true'ları say) — bu hiç değişmeyecek. İkisini aynı fonksiyonda tutsaydık,
ürün kararı değiştiğinde algoritmaya da dokunma riski doğardı. Ayırmak, "kural
değişti" ile "hesaplama mantığı değişti" senaryolarını birbirinden tamamen izole
ediyor.

## Neden `GetWeekProgress` her günü ayrı sorgulamıyor

Bunu bilerek bir **verimlilik kuralı** olarak koyduk, sadece "iyi olur" değil,
**test edilen bir gereklilik**. Yedi günlük bir görünüm için `DayLogsPort`'u 7 kez
çağırmak, her çağrının kendi network/DB round-trip'ini taşıması demek — küçük
ölçekte fark etmez ama "streak" özelliği son 30-60 günü kapsayacak şekilde
genişlerse (ki muhtemelen genişleyecek), 60 ayrı sorgu yerine 1 tane, gerçek bir
performans farkı yaratır. Bunu en baştan doğru kurmak, sonradan "neden bu endpoint
yavaş" diye optimize etmekten çok daha ucuz.

## "Bugün henüz tamamlanmadıysa streak ne olur" — neden bunu şimdi netleştiriyoruz

Bu, gözden kaçması çok kolay bir edge-case: kullanıcı sabah uygulamayı açtığında
henüz o günkü öğünlerini loglamamış olabilir — bu durumda "streak'im sıfırlandı mı"
sorusuna cevap belirsizse, kullanıcı deneyimi tutarsız olur (bazen "streak devam
ediyor" gösterip bazen "sıfırlandı" gösterebilir, hangi kod yolunun ne zaman
tetiklendiğine bağlı olarak). Bu kararı implementasyon sırasında rastgele
oluşmasına izin vermek yerine, açıkça belirlenmesini ve test edilmesini istedik —
muhtemelen doğru davranış "bugün sayılmadan, dünden geriye doğru say" (kullanıcı
günü henüz bitirmedi, cezalandırılmamalı) ama bu kararın kodda ve testte **açık**
olması, altı ay sonra biri bu koda dokunduğunda niyeti yanlış anlamasını önlüyor.

---

## Bu modülde kod yazarken genel prensip

`daily-tracking`, `nutrition-logging`'in bir "yorumlayıcısı" — kendi başına bir
gerçek kaynağı yok. Buraya yeni bir alan/tablo eklemek isterseniz, önce şunu sorun:
"bu gerçekten yeni bir veri mi, yoksa zaten var olan bir veriden türetilebilir mi?"
Çoğu durumda cevap ikincisi olacak, ve tabloya eklemek yerine hesaplamaya eklemek
daha doğru seçim olacaktır.
