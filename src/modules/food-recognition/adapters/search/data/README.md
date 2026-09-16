# Food catalog seed data

## `branded-foods-turkey.csv`

316 items across 8 chains (Burger King, Popeyes, McDonald's, Domino's Pizza, Subway,
Arby's, Sbarro, Usta Dönerci) operating in Turkey.

Source: [Fast Food Menu Prices & Nutrition in Turkey (2026)](https://www.kaggle.com/datasets/furkanenesdavarciolu/fast-food-menu-prices-and-nutrition-in-turkey-2026)
on Kaggle — community-collected, not an official chain export. No license file is
published with the dataset, so treat values as best-effort estimates rather than
verified figures; cross-check against each chain's own published nutrition page
(e.g. burgerking.com.tr/besin-degerleri) before relying on any single value for a
health-sensitive use case.

Values are per menu item/serving, not per 100g — the dataset has no gram weight to
normalize against. Imported via `npm run import:branded` with `basis=PER_SERVING`.

## `turkish-generic-dishes.csv`

35 common Turkish dishes not tied to any chain (lahmacun, döner, mantı, kuru fasulye,
mercimek çorbası, baklava, etc.), per 100g. Hand-compiled by cross-referencing several
Turkish nutrition sites (fithesap.com, diyetkolik.com, bmag.com.tr, and others) and
sanity-checked so each row's macros roughly add up to its calorie figure
(kcal ≈ 4×protein + 4×carbs + 9×fat). These are **not** an official/verified source —
treat as reasonable estimates for search/suggestion purposes, not medical-grade data.
Imported via `npm run import:turkish-dishes` with `basis=PER_100G` (portions vary too
much dish-to-dish for a fixed serving size to make sense, unlike the branded catalog).
