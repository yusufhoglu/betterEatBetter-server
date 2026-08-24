# Body Analytics Modülü — Neden Böyle Kurduk

---

## Neden `BodyMeasurement` ile `BodySilhouetteProfile` iki ayrı tablo

Spec'te ikisi de `waistCm` taşıyor, bu yüzden "tek tablo yeter" gibi görünebilir. Ama
anlamsal olarak çok farklı iki şey: biri **zaman serisi** (kullanıcı haftada bir kilosunu
tartıp kaydediyor, trend grafiği için geçmiş lazım), diğeri **anlık görüntü** (silüet
diyagramındaki güncel ölçüler, geçmişi önemli değil, sadece "şu an ne"). Bunları tek
tabloda tutmaya çalışsaydık, "hangi kaydın 'güncel profil', hangisinin 'geçmiş log'
olduğu" sorusuna suni bir cevap uydurmamız gerekirdi (örn. "en son eklenen = profil"
gibi kırılgan bir kural). İki ayrı tablo, iki ayrı sorumluluğu doğal şekilde ayırıyor —
biri güncellenince diğerinin otomatik değişmesi de gerekmiyor, çünkü kullanıcı bilinçli
olarak ikisini farklı zamanlarda, farklı amaçlarla güncelleyebilir (silüet diyagramını
ayarlarken oynayabilir, gerçek bir "ölçüm kaydı" oluşturmadan).

## Neden `heightCm`/`gender` burada tekrar tutulmuyor

Bu, sizin `3-B` kararınızın doğal sonucu. Alternatifi (kendi kopyasını tutmak) daha
basit görünürdü ama iki modülün aynı bilgiyi farklı zamanlarda güncelleyip
birbirinden sapması riski gerçek — biri güncellenip diğeri unutulursa, "boyunuz kaç"
sorusuna iki farklı cevap veren bir sistem ortaya çıkar. Tek kaynak (`onboarding-plan`),
bu riski kökünden kaldırıyor; bedeli sadece bir in-process fonksiyon çağrısı (zaten
ucuz, aynı process içinde).

## Neden outbox tüketimi polling ile, `nutrition-logging`'e geri sorgu atmak yerine

Bunu `shared-doc.md`'de genel olarak anlattık ama burada özellikle önemli çünkü
`body-analytics`'in ihtiyaç duyduğu veri (yemek isimleri, makrolar) hacimli olabilir —
her `top-foods` sorgusunda `nutrition-logging`'e gidip binlerce kaydı taşımak yerine,
event geldiğinde bir kez kendi (analitik sorgulara göre optimize edilmiş)
`MealLogReadModel`'ine yazıp sonrasında SADECE kendi tablosunu okumak çok daha verimli.
Bu aynı zamanda modül izolasyonunu da güçlendiriyor: `nutrition-logging` şu an yavaşsa/
kesintideyse, `body-analytics`'in trend grafiği göstermesi hiç etkilenmiyor — kendi
verisiyle çalışıyor.

## `trendIsGood`'un `goal`'e göre değişmesi — neden bu kadar önemli

Bunu spec doğrudan söylemiyordu ama atlarsak ciddi bir kullanıcı deneyimi hatası
olurdu: kilo almaya çalışan bir kullanıcıya, kilosu arttığında "bu kötü bir trend"
göstermek anlamsız, hatta zararlı (kullanıcıyı yanlış yönde motive eder/demotive
eder). `weight`/`bmi` özelinde `goal`'ü okuyup yönü buna göre çevirmek, ürünün asıl
amacına (kullanıcının kendi hedefine göre anlamlı geri bildirim) sadık kalmak için
gerekli. `bodyFat`/`waist`/`muscleMass`'ta bu ayrım yok çünkü bunlar için "azalması/
artması kötü" evrensel olarak sabit (kimse daha yüksek vücut yağı hedeflemiyor,
kas kütlesi hariç).

## `fraction: null` — neden sahte bir hedef uydurmuyoruz

`bodyFat`/`waist` için kullanıcı bir hedef sayısı girmiyor sisteminizde (spec'te de
böyle bir alan yok). "Bir sayı göstermek zorundayız" diye rastgele bir varsayılan
aralık (örn. "%15-20 ideal" gibi) uydurmak, kullanıcıya **görünürde kesin ama aslında
temelsiz** bir bilgi vermek olurdu — bu, "doğru olmayan ama kesin görünen" bir UI
elemanı üretir, ki bu güven kırıcı bir tasarım hatası olabilir. `null` dönmek dürüst:
mobil taraf bu durumda dial'ı boş/nötr gösterebilir, "hedef belirlenmedi" diyebilir —
gerçek durumu yansıtıyor.

## Insights'ın neden şimdilik kural tabanlı

`shared-doc.md`'de zaten bu prensibi koymuştuk: LLM entegrasyonu (maliyet, gecikme,
güvenilirlik) eklemeden önce, basit kural tabanlı bir sürümle başlayıp değeri
kanıtlamak daha güvenli. `InsightGeneratorPort` soyutlaması sayesinde, ileride
`LlmInsightGenerator`'a geçmek tek bir adapter dosyasını değiştirmek — use-case'ler
hiç etkilenmiyor.

---

## Bu modülde kod yazarken genel prensip

`body-analytics`, sisteme **yeni bir gerçek** eklemiyor — sadece var olan veriyi
(vücut ölçümleri, öğün logları) farklı açılardan yorumluyor. Yeni bir hesaplama
eklemek isterseniz, önce "bu veri zaten bir yerde var mı, yoksa gerçekten yeni bir
girdi mi gerektiriyor" diye sorun — `daily-tracking`'de benimsediğimiz aynı disiplin
burada da geçerli.
