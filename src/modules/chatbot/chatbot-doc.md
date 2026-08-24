# Chatbot Modülü — Neden Böyle Kurduk

---

## Neden `complete()` ile loop, `streamComplete()` ile sadece son yanıt

Chatbot'un "araç kullanma" yeteneği (kullanıcının yemek geçmişine bakıp cevap verme)
ile "kullanıcıya akıcı yazıyormuş gibi yanıt gösterme" (streaming) aslında iki ayrı
ihtiyaç ve aynı anda gerçekleşmiyorlar. Model önce "bu soruyu cevaplamak için
`MealDataTool`'u çağırmam lazım" diye karar veriyor — bu ara adımı kullanıcıya
token-token göstermenin bir anlamı yok (kullanıcı "tool çağırıyorum" diye bir metin
görmek istemiyor). Bu yüzden tool-calling turları senkron (`complete()`) yürüyor, model
"artık elimde yeterli bilgi var, cevap yazıyorum" dediği an devreye giren SON tur
streaming oluyor. Bu, hem OpenAI hem Anthropic'in kendi agent pattern'lerinde de
önerilen yaklaşım — bizim tasarımımız bunu genel bir prensibe çeviriyor.

## `MAX_TOOL_TURNS` neden zorunlu

Bir LLM'in "bir tool'u çağır, sonucu beğenme, tekrar çağır" döngüsüne girmesi nadir
ama gerçek bir risk — özellikle tool sonucu modelin beklediği formatta değilse. Bu
sınır olmadan, tek bir kullanıcı mesajı teorik olarak sonsuz sayıda (ya da çok yüksek
sayıda) LLM çağrısı tetikleyebilir — hem maliyet patlamasına hem kullanıcının sonsuza
kadar "yazıyor..." görmesine yol açar. 5 turluk bir sınır, neredeyse hiçbir meşru
senaryoyu etkilemeden (gerçek sorular 1-2 tool çağrısıyla çözülür) bu riski ortadan
kaldırıyor.

## Neden `tools/` köprüleri var, chatbot doğrudan diğer modüllere erişmiyor

Bu, tüm mimari boyunca tekrarladığımız "kullanan tanımlar" prensibinin chatbot'taki
karşılığı. Chatbot'un "kullanıcının bugün ne yediğini bilmesi" ihtiyacı var, ama bu
`nutrition-logging`'in iç detaylarını (tablosunu, repository'sini) bilmesi gerektiği
anlamına gelmiyor — sadece `GetDaySummary`'nin genel sözleşmesini bilmesi yeterli.
Köprü dosyaları, bu sınırı kod seviyesinde zorluyor: `MealDataTool.ts` dışında hiçbir
chatbot dosyası `nutrition-logging`'i import edemez (bunu bir lint kuralıyla da
pekiştirebilirsiniz ileride).

## `shared/llm/`'in getirdiği asıl kazanç — somut bir senaryo

Diyelim ki altı ay sonra OpenAI'ın fiyatı arttı, Anthropic'e geçmek istiyorsunuz.
`shared/llm/`'siz bir dünyada bu, chatbot'un `SendMessage`'ından `food-recognition`'ın
`LlmTextEstimator`'ına kadar her yeri tek tek bulup değiştirmek demek — her birinin
kendi OpenAI-özel kodu olurdu. Bizim tasarımımızda bu, **tek bir env değişkeni**
(`LLM_PROVIDER=anthropic`) — hiçbir modül kodu değişmiyor, çünkü hiçbiri zaten hangi
sağlayıcıyı kullandığını bilmiyordu. Bu, mimarinin başından beri savunduğumuz
Port/Adapter felsefesinin en somut kazanımlarından biri.

## Structured output'ta neden "zorla tool çağrısı" hilesi, native JSON mode değil

Bunun nedeni pratik: sağlayıcıların "JSON döndür" garantisi birbirinden farklı
güvenilirlikte. Ama "tool çağır" kabiliyeti, hemen hemen her modern LLM API'sinde
çok daha olgun ve tutarlı — çünkü bu, agent/tool-use kullanım paterninin çekirdeği,
sağlayıcılar bunu en çok test ettikleri özellik. Sahte bir "sonucu bildir" tool'u
tanımlayıp modeli onu çağırmaya zorlamak, aslında "JSON iste" demenin, sağlayıcı
farkı gözetmeyen, daha güvenilir bir yolu — ve bu teknik zaten `tools/` köprülerinde
kullandığımız mekanizmanın (`LlmToolDefinition`) bir uzantısı, yeni bir kavram
öğrenmiyoruz.

---

## Bu modülde kod yazarken genel prensip

Chatbot, sisteminizdeki **en pahalı** (token maliyeti) ve **en az öngörülebilir**
(LLM'in ne yapacağı tam kontrol edilemez) modül. Bu yüzden burada iki şeye özellikle
dikkat edin: **maliyeti sınırlayan mekanizmalar** (rate limit, `MAX_TOOL_TURNS`,
context kırpma) hiçbir zaman gevşetilmemeli, ve **modelin döndürdüğü hiçbir şeye
körü körüne güvenilmemeli** (tool çağrıları, structured output hepsi validate edilir,
`shared/errors/` taksonomisiyle).
