# Goal Management Modülü (Minimal Kapsam) — Neden Böyle Kurduk

---

## Neden `UpdateGoal` kendi tablosuna yazmıyor

`UserProfile` ve `Plan` tablolarının sahibi `onboarding-plan` — bir tabloya iki farklı
modülün yazması, "bu satırı en son kim, hangi kuralla değiştirdi" sorusunu cevapsız
bırakır ve iki modülün validasyon/hesaplama mantığının zamanla birbirinden sapmasına
yol açar (örneğin biri 1200 kcal alt sınırını uygular, diğeri unutursa). Bu yüzden
yazma işleminin kendisi `onboarding-plan`'ın `UpdatePlan` use-case'inde yaşıyor —
plan yeniden hesaplama (`PlanCalculationService`) dahil tüm kurallar tek yerde.
`goal-management` sadece "kullanıcının hedef değiştirme isteğini" doğrulayıp bu tek
yetkili noktaya iletiyor.

Bu, `CompleteOnboarding` (ilk kurulum) ile `UpdateGoal` (sonraki değişiklikler)
ayrımını da netleştiriyor: ikisi farklı HTTP yüzeyleri ve farklı kullanım anları,
ama ikisinin de arkasındaki hesaplama tek kaynaktan geçiyor.

## Neden `ComputeWeeksToGoal` bu turda yok

Bu hesap `targetWeightKg` (hedef kilo) gerektiriyor — ama minimal `onboarding-plan`
kapsamında bu alanı hiç toplamadık; o, `ComputeWeightProjection` ile birlikte
zenginleştirme turuna ait. Alanı şimdi tek başına eklemek, onboarding şemasına ve
mobil anket akışına yarım bir değişiklik sokmak demek olurdu. Zenginleştirme turu
geldiğinde `targetWeightKg` + `ComputeWeightProjection` + `ComputeWeeksToGoal` üçü
birlikte, tutarlı tek bir değişiklik olarak eklenecek.

## `heightCm`/`age`/`gender` neden `UpdateGoal`'dan değiştirilemiyor

Bunlar "hedef" değil, "profil" bilgisi — hedef değiştirme akışının (ayarlardaki
"hedefimi güncelle" ekranı) kapsamı dışındalar. Bunları da aynı endpoint'e eklemek,
use-case'in adını anlamsızlaştırır ve ileride "profil düzenleme" ayrı bir özellik
olarak geldiğinde iki akışın çakışmasına yol açar. Kapsamı dar tutmak bilinçli.

---

## Genel prensip

Bu modül kasıtlı olarak ince — neredeyse tüm işi başka modüllere devrediyor. Bu bir
eksiklik değil, tasarımın kendisi: `goal-management`'ın var olma sebebi, "hedef
değiştirme"nin kendi HTTP yüzeyi ve kendi doğrulama kuralları olan ayrı bir kullanıcı
akışı olması. İleride büyürse (`ComputeWeeksToGoal`, hedef geçmişi, hedef önerileri)
büyüyeceği yer belli; büyümezse ince kalması da sorun değil.
