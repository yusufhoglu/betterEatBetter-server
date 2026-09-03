-- body-analytics module: the silhouette snapshot is gone. The current body shape
-- is now derived from the latest body_measurements row per region, falling back
-- to the seed on user_profiles. Any value worth keeping already lives in
-- user_profiles.{waist,neck,hip,shoulder}Cm (kept in lockstep on every write).

DROP TABLE "body_silhouette_profiles";
