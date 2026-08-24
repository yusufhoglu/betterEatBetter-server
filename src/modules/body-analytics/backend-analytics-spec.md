# eatBetter Analytics Module Technical Specification

This document defines the REST API endpoints, request/response models, and calculation logic required by the mobile application's **Analytics** tab.

---

## 1. Context & Core Rules

1. **Metric Units Only**: The backend must store and return data in canonical metric units: kilograms (`kg`), centimeters (`cm`), kilocalories (`kcal`), and grams (`g`).
2. **Timezone Awareness**: All daily queries and historical logs must group and filter entries relative to the client's local timezone (e.g. `Europe/Istanbul`).
3. **Identifiers**: Every resource (measurement log entry, insight card) must return a unique UUID `id` string.

---

## 2. API Endpoint Catalog

### A. Body Analytics Summary
* **Endpoint**: `GET /analytics/body-stats`
* **Description**: Returns summary stats for the four primary variables: Weight, Body Fat, Waist, and BMI.
* **Logic**:
  * `fraction`: Dial progress proportion (e.g. current vs target constraints, range `0.0` to `1.0`).
  * `trendValue`: Difference comparing current values vs the previous week/month averages.
  * `trendIsGood`: True if the change direction is healthy (decreases in weight/body fat/waist, or increases in muscle mass).

#### Response `200 OK`
```json
{
  "weight": { "value": 72.4, "unit": "kg", "fraction": 0.65, "trendValue": -0.4, "trendIsGood": true },
  "bodyFat": { "value": 18.6, "unit": "%", "fraction": 0.45, "trendValue": 0.2, "trendIsGood": false },
  "waist": { "value": 86.0, "unit": "cm", "fraction": 0.55, "trendValue": -1.0, "trendIsGood": true },
  "bmi": { "value": 23.4, "unit": "", "fraction": 0.70, "trendValue": -0.3, "trendIsGood": true }
}
```

---

### B. Body Measurement Log History (CRUD)
Manages manual records and synced smart scale logs.
* **Supported metrics**: `weight | bodyFat | waist | neck | hip | muscleMass`
* **Supported sources**: `manual | synced | edited`

#### 1. Retrieve List
* **Endpoint**: `GET /body-measurements`
* **Query Parameters** *(optional)*: `metric`, `limit`, `cursor`
* **Response `200 OK`**:
```json
{
  "items": [
    {
      "id": "a90e3cd2-12a8-4c12-887e-e2c07b469b82",
      "date": "2026-08-20T00:00:00.000Z",
      "value": 72.4,
      "unit": "kg",
      "metric": "weight",
      "source": "manual"
    }
  ]
}
```

#### 2. Create Log Entry
* **Endpoint**: `POST /body-measurements`
* **Request Body**:
```json
{
  "metric": "weight",
  "value": 72.4,
  "unit": "kg",
  "date": "2026-08-23T14:00:00.000Z"
}
```
* **Response `201 Created`**: Returns the created log entry.

#### 3. Update Log Entry
* **Endpoint**: `PATCH /body-measurements/:id`
* **Request Body**:
```json
{
  "value": 71.8
}
```
*(Automatically sets the log `source` parameter to `"edited"`).*
* **Response `200 OK`**: Returns the updated entry.

#### 4. Delete Log Entry
* **Endpoint**: `DELETE /body-measurements/:id`
* **Response `204 No Content`**

---

### C. Trend Chart Data Series
* **Endpoint**: `GET /body-measurements/trend`
* **Query Parameters**:
  * `metric` *(required)*: `weight | bodyFat | waist | muscleMass`
  * `range` *(required)*: `1W | 1M | 3M | 6M | 1Y | All`
* **Logic**:
  * `points`: Historical coordinates ordered chronologically.
  * `deltaIsGood`: True if the net change over the duration is healthy.

#### Response `200 OK`
```json
{
  "current": 72.4,
  "unit": "kg",
  "decimals": 1,
  "points": [
    { "date": "2026-07-24T00:00:00.000Z", "value": 73.1 },
    { "date": "2026-08-01T00:00:00.000Z", "value": 72.9 },
    { "date": "2026-08-23T00:00:00.000Z", "value": 72.4 }
  ],
  "dateLabels": ["Jul 24", "Aug 1", "Aug 23"],
  "deltaIsGood": true
}
```

---

### D. Body Silhouette Profile
* **Endpoints**: `GET /analytics/body-profile` & `PATCH /analytics/body-profile`
* **Description**: Backs the interactive body outline diagram where the user logs circumferences.

#### Response / PATCH Request Body
```json
{
  "heightCm": 183.0,
  "neckCm": 36.0,
  "shoulderCm": 112.0,
  "waistCm": 86.0,
  "hipCm": 98.0,
  "sex": "male"
}
```

---

### E. Clinical Ratios & Goal Progress
* **Waist-Height Ratio**: `GET /analytics/waist-height-ratio`
  * **Formula**: `waistCm / heightCm`
  * **Classification**: `< 0.5` -> `"low"`, `0.5 to 0.6` -> `"moderate"`, `>= 0.6` -> `"high"` risk.
  * **Response**: `{ "ratio": 0.47, "classification": "low" }`

* **Goal Progress**: `GET /analytics/goal-progress`
  * **Response**:
```json
{
  "currentWeightKg": 72.4,
  "goalWeightKg": 68.0,
  "startWeightKg": 75.2,
  "streakDays": 12,
  "progressFraction": 0.42,
  "remainingKg": 4.4
}
```

---

## 3. Meals Analytics & Insights
Visualizes nutrition trends. Range values: `week | month | threeMonths | sixMonths | year | allTime`.

1. **Nutrition Averages**: `GET /analytics/meals/averages?range=week`
   * **Response**: `{ "caloriesAvg": 1842, "proteinAvgG": 126, "carbsAvgG": 188, "fiberAvgG": 27 }`

2. **Weekly Trend Series**: `GET /analytics/meals/weekly?metric=calories&range=week`
   * **Response**:
```json
{
  "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  "actual": [1980, 2120, 1850, 2200, 2040, 2300, 1900],
  "target": 2100
}
```

3. **Meal Slots Macro Breakdown**: `GET /analytics/meals/breakdown?range=month`
   * **Response**:
```json
[
  { "mealSlot": "breakfast", "calories": 430, "proteinG": 26, "carbsG": 42, "fatG": 12 },
  { "mealSlot": "lunch", "calories": 750, "proteinG": 48, "carbsG": 82, "fatG": 25 }
]
```

4. **Frequently Logged Foods**: `GET /analytics/meals/top-foods?range=week`
   * **Response**: `[ { "name": "Chicken Rice Bowl", "logCount": 8, "mealSlot": "lunch" } ]`

5. **AI Nutritional Insights**: `GET /analytics/meals/insights?range=week`
   * **Response**: `[ { "title": "Consistency Award", "body": "You hit your protein targets 6/7 days this week!" } ]`

6. **Variable Correlations**: `GET /analytics/meals/correlation?x=calories&y=bodyFat&range=month`
   * **Response**: `[ { "date": "2026-08-01", "x": 1980, "y": 22.4 } ]`
