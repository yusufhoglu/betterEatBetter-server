# eatBetter Analytics Module - API Contract Specification

This document details the exact HTTP requests, endpoints, parameter keys, and JSON schemas expected by the Mobile App's **Analytics** tab. Use this to verify and align the NestJS backend implementation.

---

## 1. Authentication
All endpoints listed below require the standard Authorization header with a valid Bearer token:
```http
Authorization: Bearer <access_token>
```

---

## 2. Body Analytics Endpoints

### 2.1 GET `/analytics/body-stats`
* **Description**: Retrieves summary stats for the four primary variables shown in the top stats carousel of the Analytics page.
* **Response `200 OK`**:
```json
{
  "weight": {
    "value": 72.4,
    "unit": "kg",
    "fraction": 0.65,
    "trendValue": -0.8,
    "trendIsGood": true
  },
  "bodyFat": {
    "value": 22.5,
    "unit": "%",
    "fraction": null,
    "trendValue": -0.4,
    "trendIsGood": true
  },
  "waist": {
    "value": 85.0,
    "unit": "cm",
    "fraction": null,
    "trendValue": -0.5,
    "trendIsGood": true
  },
  "bmi": {
    "value": 21.6,
    "unit": "",
    "fraction": 0.55,
    "trendValue": -0.2,
    "trendIsGood": true
  }
}
```
* **Validation / Notes**:
  * `weight.value` represents the latest recorded `weight` log in `/body-measurements`, or falls back to onboarding profile `weightKg`.
  * `waist.value` represents the latest recorded `waist` log in `/body-measurements`, or falls back to silhouette profile `waistCm`.
  * `bodyFat.value` only comes from `/body-measurements` with `metric=bodyFat`; there is no automatic fallback or derived calculation in the backend.
  * If a user has never logged a metric, `value` may return `null` (the mobile app is protected to default this safely to `0.0`).
  * `fraction`: Dial progress proportion towards goal (between `0.0` and `1.0`). If not applicable, returns `null`.
  * `trendValue`: Difference comparing current week average vs. previous week average.
  * `trendIsGood`: Boolean carrying the metric's health semantics (e.g. weight dropping is `true`, bodyFat dropping is `true`, waist dropping is `true`).

---

### 2.2 GET `/analytics/body-profile`
* **Description**: Fetches the current silhouette dimensions used to display the interactive body outline diagram.
* **Response `200 OK`**:
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
* **Validation / Notes**:
  * `sex` must be exactly `"male"` or `"female"`.

---

### 2.3 PATCH `/analytics/body-profile`
* **Description**: Updates the current silhouette state. Sent when the user releases/exits dragging a body region on the interactive diagram.
* **Request Body**:
```json
{
  "neckCm": 36.5,
  "shoulderCm": 112.0,
  "waistCm": 85.5,
  "hipCm": 98.0
}
```
* **Response `200 OK`**: Returns the updated `BodyProfile` object (same structure as `GET /analytics/body-profile`).

---

### 2.4 GET `/analytics/waist-height-ratio`
* **Description**: Returns the clinical risk ratio based on current height and waist measurements.
* **Response `200 OK`**:
```json
{
  "ratio": 0.47,
  "classification": "low"
}
```
* **Validation / Notes**:
  * `classification` must be one of: `"low"` | `"moderate"` | `"high"`.

---

### 2.5 GET `/analytics/goal/progress` (or `/analytics/goal-progress`)
* **Description**: Returns weight-goal progression, streak logs, and remaining weight metrics.
* **Response `200 OK`**:
```json
{
  "currentWeightKg": 72.4,
  "goalWeightKg": 68.0,
  "startWeightKg": 75.2,
  "streakDays": 5,
  "progressFraction": 0.39,
  "remainingKg": 4.4
}
```

---

### 2.6 GET `/body-measurements`
* **Description**: Lists historical logs. Used to populate the "History" list bottom sheets.
* **Query Parameters**:
  * `metric` *(optional)*: Filter entries. Allowed values: `weight` | `bodyFat` | `waist` | `neck` | `hip` | `muscleMass`.
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
* **Validation / Notes**:
  * `metric` values returned in JSON must be lowercase (`weight`, `bodyFat`, etc.).
  * `source` must be one of: `"manual"` | `"synced"` | `"edited"`.

---

### 2.7 POST `/body-measurements`
* **Description**: Creates a new historical log entry (called from the "Add Measurement" modal sheet or when committing a drag region change on the body silhouette).
* **Request Body**:
```json
{
  "metric": "waist",
  "value": 85.5,
  "unit": "cm",
  "date": "2026-08-24T15:20:00.000Z"
}
```
* **Response `201 Created`**: Returns the newly created log entry (same JSON schema as items in `GET /body-measurements`).
* **Validation / Notes**:
  * The backend validates that `unit` matches the canonical metric unit for the `metric` type:
    * `weight` / `muscleMass` -> must be `"kg"`
    * `bodyFat` -> must be `"%"`
    * `waist` / `neck` / `hip` -> must be `"cm"`
  * `date` is optional. If not provided, the backend defaults to the current server timestamp.

---

### 2.8 PATCH `/body-measurements/:id`
* **Description**: Edits an existing historical entry in the "History" edit drawer.
* **Request Body**:
```json
{
  "value": 71.8,
  "unit": "kg"
}
```
* **Response `200 OK`**: Returns the updated entry.

---

### 2.9 GET `/body-measurements/trend`
* **Description**: Fetches data points to render the line chart inside the `WeightTrendCard` widget.
* **Query Parameters**:
  * `metric` *(required)*: `weight` | `bodyFat` | `waist` | `muscleMass`
  * `range` *(required)*: `1W` | `1M` | `3M` | `6M` | `1Y` | `All`
* **Response `200 OK`**:
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
* **Validation / Notes**:
  * `points` must be ordered chronologically.
  * `points[].date` is returned as a full ISO datetime string.

---

## 3. Meal Analytics Endpoints (Nutrition)

### 3.1 GET `/analytics/meals/averages`
* **Description**: Returns the average intake values for the selected range.
* **Query Parameters**:
  * `range` *(required)*: `week` | `month` | `threeMonths` | `sixMonths` | `year` | `allTime`
* **Response `200 OK`**:
```json
{
  "caloriesAvg": 2150,
  "proteinAvgG": 132,
  "carbsAvgG": 245,
  "fiberAvgG": 28
}
```
* **Validation / Notes**:
  * Average values are returned as integers (`int`).

---

### 3.2 GET `/analytics/meals/weekly`
* **Description**: Returns actual vs target weekly comparison numbers for the bar chart.
* **Query Parameters**:
  * `metric` *(required)*: `calories` | `protein` | `carbs` | `fiber`
  * `range` *(required)*: `week` | `month` | `threeMonths` | `sixMonths` | `year` | `allTime`
* **Response `200 OK`**:
```json
{
  "days": ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
  "actual": [1950.0, 2200.0, 1800.0, 2100.0, 2350.0, 1700.0, 2050.0],
  "target": 2100.0
}
```
* **Validation / Notes**:
  * `actual` is returned as rounded numeric values.
  * `days` are short weekday name strings.

---

### 3.3 GET `/analytics/meals/top-foods`
* **Description**: Returns the most eaten foods inside the selected range.
* **Query Parameters**:
  * `range` *(required)*: `week` | `month` | `threeMonths` | `sixMonths` | `year` | `allTime`
* **Response `200 OK`**:
```json
[
  {
    "name": "Chicken Breast",
    "logCount": 12,
    "mealSlot": "lunch"
  },
  {
    "name": "Oatmeal",
    "logCount": 8,
    "mealSlot": "breakfast"
  }
]
```
* **Validation / Notes**:
  * `mealSlot` must be exactly: `"breakfast"` | `"lunch"` | `"dinner"` | `"snack"`.

---

### 3.4 GET `/analytics/meals/insights`
* **Description**: Lists short text insights about the user's eating patterns.
* **Query Parameters**:
  * `range` *(required)*: `week` | `month` | `threeMonths` | `sixMonths` | `year` | `allTime`
* **Response `200 OK`**:
```json
[
  {
    "title": "Protein Goal Achieved",
    "body": "You hit your daily protein goal 5 out of 7 days this week. Excellent job!"
  },
  {
    "title": "Fiber Check",
    "body": "Your fiber intake is slightly below the recommended target. Try adding more leafy greens or oatmeal."
  }
]
```

---

### 3.5 GET `/analytics/meals/correlation`
* **Description**: Returns coordinates to draw the nutrient-to-body correlation chart.
* **Query Parameters**:
  * `x` *(required)*: Nutrition metric. Values: `calories` | `protein` | `carbs` | `fiber`
  * `y` *(required)*: Body metric. Values: `weight` | `bodyFat` | `waist` | `muscleMass`
  * `range` *(required)*: `week` | `month` | `threeMonths` | `sixMonths` | `year` | `allTime`
* **Response `200 OK`**:
```json
[
  {
    "date": "2026-08-20T00:00:00.000Z",
    "x": 2100.0,
    "y": 72.4
  },
  {
    "date": "2026-08-21T00:00:00.000Z",
    "x": 2350.0,
    "y": 72.2
  }
]
```
* **Validation / Notes**:
  * `x` and `y` represent matched historical coordinates for the given date.
