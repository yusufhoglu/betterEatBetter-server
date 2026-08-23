# Onboarding Plan Modülü (Minimal Kapsam) — Neden Böyle Kurduk

Bu doküman `onboarding-plan`'ın neden bilinçli olarak dar bir kapsamla kurulduğunu ve
tablo/erişim kararlarının gerekçesini anlatır.

---

## Neden minimal — `identity`'deki hibrit yaklaşımın tekrarı

`nutrition-logging`'e geçebilmek için tek ihtiyacımız olan şey, günlük kalori/makro
hedefinin **gerçek bir kaynaktan** okunabilmesiydi — `ComputeHealthScore` ya da
`ComputeWeightProjection` gibi zenginleştirmelere henüz ihtiyaç yok. Bunları da bu turda
yazmaya kalkışmak, `nutrition-logging`'e geçişi geciktirir ve henüz kullanılmayan kod
üretir. `identity`'de Apple/Google'ı sona bıraktığımız mantığın aynısı: **temel iskeleti
sağlam kurup, zenginleştirmeyi ayrı bir tura bırakmak.**

## Neden `UserProfile`/`Plan`, `identity.User`'a eklenmiyor

`identity` modülü sadece "bu kişi kim, nasıl doğrulanıyor" sorusuna cevap vermeli — kilo,
boy, hedef gibi bilgiler kimlik doğrulamanın parçası değil, tamamen farklı bir yaşam
döngüsüne sahip (kullanıcı hesabını değiştirmeden bu bilgileri güncelleyebilir). İkisini
aynı tabloda tutmak, `identity`'nin tek sorumluluğunu (kimlik) bulanıklaştırırdı. Ayrı
tablo, ileride "kullanıcı verisini KVKK gereği sil" gibi bir talep geldiğinde de işinizi
kolaylaştırıyor — hangi tablonun hangi kategoriye ait olduğu net.

## `GetActivePlan` neden bir Port değil, doğrudan bir use-case çağrısı

Modüller arası iletişim kuralımız "sadece public Port/use-case üzerinden" diyor ama
burada ince bir ayrım var: `nutrition-logging` kendi `DailyTargetsPort`'unu tanımlıyor
(kural: kullanan tanımlar), bu Port'un **implementasyonu** ise `onboarding-plan`'ın
sunduğu `GetActivePlan` use-case'ini çağıran ince bir adapter. Yani `onboarding-plan`
bir Port sunmuyor, sadece **stabil bir public fonksiyon** sunuyor — modüler monolit
içinde bu, bir HTTP çağrısı değil, doğrudan bir TypeScript fonksiyon çağrısı. Bu, tam
olarak `chatbot`'un `tools/` köprülerinde kullandığımız pattern'in aynısı: bir modül,
başka bir modülün iç detayına değil, onun kasıtlı olarak dışa açtığı bir noktaya erişiyor.

## "Plan bulunamazsa hata değil, null" kararının arkasındaki düşünce

İlk refleks "kullanıcı onboarding'i tamamlamadıysa günlük özet isteği reddedilsin" olabilir.
Ama bunu düşünün: bu, `nutrition-logging`'i `onboarding-plan`'ın durumuna sıkı sıkıya
bağlar — birinde çıkan bir hata diğerini de bloke eder. Oysa bir kullanıcının "hedefi
olmadan da ne yediğini görmek istemesi" gayet makul bir senaryo (örneğin sadece kalori
takibi yapmak isteyen ama hedef belirlememiş biri). `null` dönüp `remaining`/`goal`
alanlarını boş bırakmak, `consumed` bilgisini yine de göstermeye izin veriyor — daha
esnek, daha az kırılgan bir tasarım.

## Plan geçmişinin tutulmaması — bilinçli bir sınırlama

`Plan.userId` unique olduğu için, hedef değiştikçe (via `goal-management/UpdateGoal`)
aynı satır güncelleniyor, eski değerler kaybolıyor. Bu "veri kaybı" gibi görünebilir ama
şu an için gerçek bir ihtiyaç yok — kullanıcı "geçmişte hedefim neydi" diye sormuyor,
sadece "şu an hedefim ne" sorusuna cevap lazım. İleride "hedef geçmişi" gibi bir özellik
istenirse, `PlanHistory` tablosu eklemek geriye dönük uyumlu bir değişiklik (mevcut `Plan`
tablosunu bozmaz), o yüzden şimdiden bu karmaşıklığı eklemedik.

---

## Bu modülde kod yazarken genel prensip

Bu modül, ileride `ComputeHealthScore` gibi zenginleştirmelerle büyüyecek — ama bugün
sadece `nutrition-logging`'in ihtiyacı olan minimum işlevi sağlıyor. Yeni bir şey eklemek
isterseniz (ve bu prompt'un kapsamında değilse), önce "bu gerçekten şimdi mi lazım, yoksa
sonraki bir tur için mi" diye sorun — erken genişleme, `identity`'de kaçındığımız aynı
riski burada da yaratır.
