# eatBetter API Endpoints Documentation

This document contains a comprehensive catalog of all API endpoints in the `eatBetter` backend, detailing where they are defined, what they do, request/response models, and concrete request/response payload examples.

---

## 🔑 Global Authentication & Error Mapping

### Authentication Scheme
All endpoints except the `/auth/*` endpoints require authentication.
Authentication is handled via the `authMiddleware` which extracts and validates a JSON Web Token (JWT) from the HTTP Authorization header:
```http
Authorization: Bearer <accessToken>
```

### Global Error Payload Format
When a validation, authentication, or business logic rule fails, the API returns a structured error object with an appropriate HTTP status code (e.g., `400`, `401`, `404`, `409`, `429`):
```json
{
  "code": "ERROR_CODE_IDENTIFIER",
  "message": "A detailed, human-readable error description explaining what went wrong."
}
```
*For `429 Too Many Requests` responses, a `Retry-After` header is included containing the number of seconds to wait before retrying.*

---

## 📁 1. Identity & Session Module (`/auth`)

* **Router File**: [`identityRoutes.ts`](file:///c:/Users/hocao/Desktop/eatBetter/backend/src/modules/identity/http/identityRoutes.ts)
* **Controller File**: [`IdentityController.ts`](file:///c:/Users/hocao/Desktop/eatBetter/backend/src/modules/identity/http/IdentityController.ts)
* **Authentication**: Not required.

---

### POST `/auth/sign-up`
* **What it does**: Registers a new user with an email and password, checks password strength, hashes the password, creates the user in the database, and automatically issues a new session (access and refresh tokens).
* **Request Header**: `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "securePassword123!"
  }
  ```
* **Response Status**: `201 Created`
* **Response Body**:
  ```json
  {
    "userId": "d748f29c-fa20-4a8b-944a-d603a11f2619",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkNzQ4ZjI5Yy1mYTIwLTRhOGItOTQ0YS1kNjAzYTExZjI2MTkiLCJpYXQiOjE3ODYzNDEyMDAsImV4cCI6MTc4NjM0NDgwMH0...",
    "refreshToken": "8f88c3a1-77e8-4680-a681-42e88a3b5a1c",
    "refreshTokenExpiresAt": "2026-08-31T02:12:00.000Z"
  }
  ```
* **Possible Errors**:
  * `400 Bad Request` (`PASSWORD_TOO_WEAK` / `INVALID_REQUEST_BODY`)
  * `409 Conflict` (`EMAIL_ALREADY_REGISTERED`)

---

### POST `/auth/sign-in`
* **What it does**: Authenticates an existing user using their email and password, issuing a new session on success.
* **Request Header**: `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "email": "user@example.com",
    "password": "securePassword123!"
  }
  ```
* **Response Status**: `200 OK`
* **Response Body**:
  ```json
  {
    "userId": "d748f29c-fa20-4a8b-944a-d603a11f2619",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkNzQ4ZjI5Yy1mYTIwLTRhOGItOTQ0YS1kNjAzYTExZjI2MTkiLCJpYXQiOjE3ODYzNDEyMDAsImV4cCI6MTc4NjM0NDgwMH0...",
    "refreshToken": "8f88c3a1-77e8-4680-a681-42e88a3b5a1c",
    "refreshTokenExpiresAt": "2026-08-31T02:12:00.000Z"
  }
  ```
* **Possible Errors**:
  * `400 Bad Request` (`INVALID_REQUEST_BODY`)
  * `401 Unauthorized` (`INVALID_CREDENTIALS`)

---

### POST `/auth/refresh`
* **What it does**: Re-issues a new short-lived access token and a refreshed session using a valid refresh token.
* **Request Header**: `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "refreshToken": "8f88c3a1-77e8-4680-a681-42e88a3b5a1c"
  }
  ```
* **Response Status**: `200 OK`
* **Response Body**:
  ```json
  {
    "userId": "d748f29c-fa20-4a8b-944a-d603a11f2619",
    "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOiJkNzQ4ZjI5Yy1mYTIwLTRhOGItOTQ0YS1kNjAzYTExZjI2MTkiLCJpYXQiOjE3ODYzNDEyMDAsImV4cCI6MTc4NjM0NDgwMH0...",
    "refreshToken": "9d492b45-12b2-4d2a-89aa-9b18204620f3",
    "refreshTokenExpiresAt": "2026-08-31T02:15:00.000Z"
  }
  ```
* **Possible Errors**:
  * `400 Bad Request` (`INVALID_REQUEST_BODY`)
  * `401 Unauthorized` (`REFRESH_TOKEN_EXPIRED` / `REFRESH_TOKEN_NOT_FOUND`)

---

## 📁 2. Onboarding & Target Calculation Module (`/onboarding`)

* **Router File**: [`onboardingRoutes.ts`](file:///c:/Users/hocao/Desktop/eatBetter/backend/src/modules/onboarding-plan/http/onboardingRoutes.ts)
* **Controller File**: [`OnboardingController.ts`](file:///c:/Users/hocao/Desktop/eatBetter/backend/src/modules/onboarding-plan/http/OnboardingController.ts)
* **Authentication**: Required (`Bearer` Token)

---

### POST `/onboarding/complete`
* **What it does**: Handles the first-time profile completion. It saves the physical attributes and weekly activity goals, calculates user calorie and macro targets, and persists the initial plan.
* **Request Header**: `Authorization: Bearer <token>`, `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "weightKg": 78.5,
    "heightCm": 182,
    "age": 27,
    "gender": "male",
    "workoutsPerWeek": 3,
    "goal": "lose",
    "weeklyPaceKg": 0.5
  }
  ```
  *(Supported goals: `"lose" | "maintain" | "gain"`. Supported genders: `"male" | "female"`)*
* **Response Status**: `201 Created`
* **Response Body**:
  ```json
  {
    "userId": "d748f29c-fa20-4a8b-944a-d603a11f2619",
    "dailyCalories": 2240,
    "proteinG": 168,
    "carbsG": 230,
    "fatG": 72,
    "createdAt": "2026-08-24T02:12:00.000Z",
    "updatedAt": "2026-08-24T02:12:00.000Z"
  }
  ```
* **Possible Errors**:
  * `400 Bad Request` (`INVALID_REQUEST_BODY`)
  * `401 Unauthorized` (`MISSING_ACCESS_TOKEN` / `INVALID_ACCESS_TOKEN`)
  * `409 Conflict` (`ALREADY_ONBOARDED` - User has already onboarded)

---

## 📁 3. Goal Management Module (`/goal`)

* **Router File**: [`goalManagementRoutes.ts`](file:///c:/Users/hocao/Desktop/eatBetter/backend/src/modules/goal-management/http/goalManagementRoutes.ts)
* **Controller File**: [`GoalManagementController.ts`](file:///c:/Users/hocao/Desktop/eatBetter/backend/src/modules/goal-management/http/GoalManagementController.ts)
* **Authentication**: Required (`Bearer` Token)

---

### PATCH `/goal/goal`
* **What it does**: Updates one or more parameters of the user's goals (weight, workouts, rate of change, target goal). On save, it automatically recalculates target calories and macros and updates the user's active plan.
* **Request Header**: `Authorization: Bearer <token>`, `Content-Type: application/json`
* **Request Body** *(At least one field is required)*:
  ```json
  {
    "weightKg": 77.2,
    "workoutsPerWeek": 4
  }
  ```
* **Response Status**: `200 OK`
* **Response Body**:
  ```json
  {
    "userId": "d748f29c-fa20-4a8b-944a-d603a11f2619",
    "dailyCalories": 2310,
    "proteinG": 173,
    "carbsG": 240,
    "fatG": 74,
    "createdAt": "2026-08-24T02:12:00.000Z",
    "updatedAt": "2026-08-24T02:15:30.000Z"
  }
  ```
* **Possible Errors**:
  * `400 Bad Request` (`INVALID_GOAL_UPDATE` - e.g. empty request body)
  * `401 Unauthorized` (`MISSING_ACCESS_TOKEN` / `INVALID_ACCESS_TOKEN`)
  * `404 Not Found` (`USER_PROFILE_NOT_FOUND` - User must onboard first)

---

## 📁 4. Food Recognition Module (`/food`)

* **Router File**: [`foodRecognitionRoutes.ts`](file:///c:/Users/hocao/Desktop/eatBetter/backend/src/modules/food-recognition/http/foodRecognitionRoutes.ts)
* **Controller File**: [`FoodRecognitionController.ts`](file:///c:/Users/hocao/Desktop/eatBetter/backend/src/modules/food-recognition/http/FoodRecognitionController.ts)
* **Authentication**: Required (`Bearer` Token)

---

### POST `/food/photo`
* **What it does**: Triggers an **asynchronous** photo recognition flow. The photo analysis is offloaded to a background LLM process.
* **Rate Limit**: 5 requests per minute per user.
* **Request Header**: `Authorization: Bearer <token>`, `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "mealPhotoId": "a90e3cd2-12a8-4c12-887e-e2c07b469b82"
  }
  ```
* **Response Status**: `202 Accepted`
* **Response Body**:
  ```json
  {
    "mealPhotoId": "a90e3cd2-12a8-4c12-887e-e2c07b469b82"
  }
  ```
* **Possible Errors**:
  * `400 Bad Request` (`INVALID_BODY`)
  * `401 Unauthorized` (`MISSING_ACCESS_TOKEN` / `INVALID_ACCESS_TOKEN`)
  * `429 Too Many Requests` (`RATE_LIMIT_EXCEEDED`)

---

### GET `/food/photo/:mealPhotoId`
* **What it does**: A polling endpoint used to retrieve the status or results of an asynchronous photo recognition request.
* **Request Header**: `Authorization: Bearer <token>`
* **Response Status**: `200 OK`
* **Response Body**:
  ```json
  {
    "id": "a90e3cd2-12a8-4c12-887e-e2c07b469b82",
    "userId": "d748f29c-fa20-4a8b-944a-d603a11f2619",
    "source": "photo",
    "status": "completed",
    "items": [
      {
        "name": "Grilled Chicken Breast",
        "portionGrams": 150,
        "calories": 248,
        "proteinGrams": 46.5,
        "carbsGrams": 0,
        "fatGrams": 5.4
      },
      {
        "name": "Steamed Broccoli",
        "portionGrams": 100,
        "calories": 35,
        "proteinGrams": 2.8,
        "carbsGrams": 7,
        "fatGrams": 0.4
      }
    ],
    "macros": {
      "totalCalories": 283,
      "totalProteinGrams": 49.3,
      "totalCarbsGrams": 7,
      "totalFatGrams": 5.8
    },
    "needsUserAction": false,
    "errorCode": null,
    "createdAt": "2026-08-24T02:13:00.000Z"
  }
  ```
  *(Note: `status` can be `"processing" | "completed" | "insufficient_data" | "failed"`)*
* **Possible Errors**:
  * `401 Unauthorized` (`MISSING_ACCESS_TOKEN` / `INVALID_ACCESS_TOKEN`)
  * `404 Not Found` (`FOOD_ENTRY_NOT_FOUND`)

---

### POST `/food/barcode`
* **What it does**: Triggers a **synchronous** barcode scanning flow. It implements a cache-aside pattern: first checks Redis (including a negative cache for non-existent items); if missed, checks the external OpenFoodFacts database and caches it.
* **Rate Limit**: 10 requests per minute per user.
* **Request Header**: `Authorization: Bearer <token>`, `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "barcode": "8690526010022"
  }
  ```
* **Response Status**: `200 OK`
* **Response Body**:
  ```json
  {
    "source": "barcode",
    "items": [
      {
        "name": "Strained Yogurt 500g",
        "portionGrams": 500,
        "calories": 330,
        "proteinGrams": 17.5,
        "carbsGrams": 20,
        "fatGrams": 20
      }
    ],
    "macros": {
      "totalCalories": 330,
      "totalProteinGrams": 17.5,
      "totalCarbsGrams": 20,
      "totalFatGrams": 20
    },
    "needsUserAction": false
  }
  ```
* **Possible Errors**:
  * `400 Bad Request` (`INVALID_BODY`)
  * `401 Unauthorized` (`MISSING_ACCESS_TOKEN` / `INVALID_ACCESS_TOKEN`)
  * `404 Not Found` (`BARCODE_NOT_FOUND` - Negative/Positive misses)
  * `429 Too Many Requests` (`RATE_LIMIT_EXCEEDED`)

---

### POST `/food/text`
* **What it does**: Triggers a **synchronous** text recognition flow. Parses natural descriptions of a meal (e.g. `"2 eggs and one slice of toast"`) via an LLM and maps them to portion and macro estimations.
* **Rate Limit**: 10 requests per minute per user.
* **Request Header**: `Authorization: Bearer <token>`, `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "text": "1 scoop of whey protein and 200ml of skim milk"
  }
  ```
* **Response Status**: `200 OK`
* **Response Body**:
  ```json
  {
    "source": "text",
    "items": [
      {
        "name": "Whey Protein Powder",
        "portionGrams": 30,
        "calories": 120,
        "proteinGrams": 24,
        "carbsGrams": 3,
        "fatGrams": 1.5
      },
      {
        "name": "Skim Milk",
        "portionGrams": 200,
        "calories": 70,
        "proteinGrams": 6.8,
        "carbsGrams": 9.8,
        "fatGrams": 0.2
      }
    ],
    "macros": {
      "totalCalories": 190,
      "totalProteinGrams": 30.8,
      "totalCarbsGrams": 12.8,
      "totalFatGrams": 1.7
    },
    "needsUserAction": false
  }
  ```
* **Possible Errors**:
  * `400 Bad Request` (`INVALID_BODY` - missing text or > 500 chars)
  * `401 Unauthorized` (`MISSING_ACCESS_TOKEN` / `INVALID_ACCESS_TOKEN`)
  * `429 Too Many Requests` (`RATE_LIMIT_EXCEEDED`)

---

### GET `/food/search`
* **What it does**: Queries the local pre-imported USDA FoodData Central database for ingredient search. No external networks are reached.
* **Request Header**: `Authorization: Bearer <token>`
* **Query Parameters**:
  * `q` *(required)*: Query search term (e.g., `apple`)
  * `limit` *(optional)*: Limit (1 to 100, default `20`)
* **Response Status**: `200 OK`
* **Response Body**:
  ```json
  {
    "items": [
      {
        "id": "usda-171688",
        "name": "Apple, raw, with skin",
        "caloriesPer100g": 52,
        "proteinPer100g": 0.26,
        "carbsPer100g": 13.81,
        "fatPer100g": 0.17
      }
    ]
  }
  ```
* **Possible Errors**:
  * `400 Bad Request` (`INVALID_QUERY`)
  * `401 Unauthorized` (`MISSING_ACCESS_TOKEN` / `INVALID_ACCESS_TOKEN`)

---

## 📁 5. Nutrition Logging Module (`/nutrition-logs`)

* **Router File**: [`nutritionLoggingRoutes.ts`](file:///c:/Users/hocao/Desktop/eatBetter/backend/src/modules/nutrition-logging/http/nutritionLoggingRoutes.ts)
* **Controller File**: [`NutritionLoggingController.ts`](file:///c:/Users/hocao/Desktop/eatBetter/backend/src/modules/nutrition-logging/http/NutritionLoggingController.ts)
* **Authentication**: Required (`Bearer` Token)

---

### POST `/nutrition-logs/`
* **What it does**: Saves one or multiple verified food entries under a specific meal category (breakfast, lunch, dinner, snack) for the user's day (which is computed dynamically based on the client's `timeZone`).
* **Request Header**: `Authorization: Bearer <token>`, `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "mealType": "breakfast",
    "timeZone": "Europe/Istanbul",
    "entries": [
      {
        "id": "d748f29c-fa20-4a8b-944a-d603a11f2619",
        "name": "Banana",
        "portionGrams": 120,
        "calories": 105,
        "proteinG": 1.3,
        "carbsG": 27,
        "fatG": 0.3
      }
    ]
  }
  ```
  *(Supported meal types: `"breakfast" | "lunch" | "dinner" | "snack"`)*
* **Response Status**: `201 Created`
* **Response Body**:
  ```json
  {
    "id": "e98ca30e-fa9a-4c28-bb88-d102e3a19b88",
    "userId": "d748f29c-fa20-4a8b-944a-d603a11f2619",
    "date": "2026-08-24T00:00:00.000Z",
    "mealType": "breakfast",
    "entries": [
      {
        "id": "d748f29c-fa20-4a8b-944a-d603a11f2619",
        "name": "Banana",
        "portionGrams": 120,
        "calories": 105,
        "proteinG": 1.3,
        "carbsG": 27,
        "fatG": 0.3
      }
    ],
    "createdAt": "2026-08-24T02:13:00.000Z",
    "updatedAt": "2026-08-24T02:13:00.000Z"
  }
  ```
* **Possible Errors**:
  * `400 Bad Request` (`INVALID_REQUEST_BODY` / `INVALID_TIME_ZONE`)
  * `401 Unauthorized` (`MISSING_ACCESS_TOKEN` / `INVALID_ACCESS_TOKEN`)

---

### GET `/nutrition-logs/day-summary`
* **What it does**: Fetches the daily summary progress: total calories consumed vs daily calorie target goals, macro-nutrient targets, remaining calorie limits, and percentages.
* **Request Header**: `Authorization: Bearer <token>`
* **Query Parameters**:
  * `timeZone` *(required)*: Timezone string (e.g. `Europe/Istanbul`)
* **Response Status**: `200 OK`
* **Response Body**:
  ```json
  {
    "userId": "d748f29c-fa20-4a8b-944a-d603a11f2619",
    "date": "2026-08-24T00:00:00.000Z",
    "mealItems": [
      {
        "id": "e98ca30e-fa9a-4c28-bb88-d102e3a19b88",
        "userId": "d748f29c-fa20-4a8b-944a-d603a11f2619",
        "date": "2026-08-24T00:00:00.000Z",
        "mealType": "breakfast",
        "entries": [
          {
            "id": "d748f29c-fa20-4a8b-944a-d603a11f2619",
            "name": "Banana",
            "portionGrams": 120,
            "calories": 105,
            "proteinG": 1.3,
            "carbsG": 27,
            "fatG": 0.3
          }
        ],
        "createdAt": "2026-08-24T02:13:00.000Z",
        "updatedAt": "2026-08-24T02:13:00.000Z"
      }
    ],
    "consumed": {
      "calories": 105,
      "protein": 1.3,
      "carbs": 27,
      "fat": 0.3
    },
    "dailyCalorieGoal": 2240,
    "dailyProteinGoal": 168,
    "dailyCarbsGoal": 230,
    "dailyFatGoal": 72,
    "remainingCalories": 2135,
    "progress": {
      "calories": {
        "consumed": 105,
        "goal": 2240,
        "remaining": 2135,
        "percentage": 4.69
      },
      "protein": {
        "consumed": 1.3,
        "goal": 168,
        "remaining": 166.7,
        "percentage": 0.77
      },
      "carbs": {
        "consumed": 27,
        "goal": 230,
        "remaining": 203,
        "percentage": 11.74
      },
      "fat": {
        "consumed": 0.3,
        "goal": 72,
        "remaining": 71.7,
        "percentage": 0.42
      }
    }
  }
  ```
* **Possible Errors**:
  * `400 Bad Request` (`INVALID_REQUEST_BODY` / `INVALID_TIME_ZONE`)
  * `401 Unauthorized` (`MISSING_ACCESS_TOKEN` / `INVALID_ACCESS_TOKEN`)

---

### PATCH `/nutrition-logs/entries/:entryId`
* **What it does**: Edits a single food entry details inside a meal on the date resolved by the timezone.
* **Request Header**: `Authorization: Bearer <token>`, `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "mealType": "breakfast",
    "timeZone": "Europe/Istanbul",
    "entry": {
      "id": "d748f29c-fa20-4a8b-944a-d603a11f2619",
      "name": "Organic Banana",
      "portionGrams": 150,
      "calories": 130,
      "proteinG": 1.6,
      "carbsG": 33,
      "fatG": 0.4
    }
  }
  ```
* **Response Status**: `200 OK`
* **Response Body**: Returns the updated `MealItem` object (same structure as `POST /nutrition-logs/`).
* **Possible Errors**:
  * `400 Bad Request` (`INVALID_REQUEST_BODY` / `INVALID_TIME_ZONE`)
  * `401 Unauthorized` (`MISSING_ACCESS_TOKEN` / `INVALID_ACCESS_TOKEN`)
  * `404 Not Found` (`MEAL_ENTRY_NOT_FOUND`)

---

### DELETE `/nutrition-logs/entries/:entryId`
* **What it does**: Removes a single logged entry from a specific meal category.
* **Request Header**: `Authorization: Bearer <token>`, `Content-Type: application/json`
* **Request Body**:
  ```json
  {
    "mealType": "breakfast",
    "timeZone": "Europe/Istanbul"
  }
  ```
* **Response Status**: `200 OK`
* **Response Body**:
  ```json
  {
    "mealItem": {
      "id": "e98ca30e-fa9a-4c28-bb88-d102e3a19b88",
      "userId": "d748f29c-fa20-4a8b-944a-d603a11f2619",
      "date": "2026-08-24T00:00:00.000Z",
      "mealType": "breakfast",
      "entries": [],
      "createdAt": "2026-08-24T02:13:00.000Z",
      "updatedAt": "2026-08-24T02:17:15.000Z"
    }
  }
  ```
* **Possible Errors**:
  * `400 Bad Request` (`INVALID_REQUEST_BODY` / `INVALID_TIME_ZONE`)
  * `401 Unauthorized` (`MISSING_ACCESS_TOKEN` / `INVALID_ACCESS_TOKEN`)
  * `404 Not Found` (`MEAL_ENTRY_NOT_FOUND`)

---

## 📁 6. Daily Tracking & Streak Module (`/tracking`)

* **Router File**: [`dailyTrackingRoutes.ts`](file:///c:/Users/hocao/Desktop/eatBetter/backend/src/modules/daily-tracking/http/dailyTrackingRoutes.ts)
* **Controller File**: [`DailyTrackingController.ts`](file:///c:/Users/hocao/Desktop/eatBetter/backend/src/modules/daily-tracking/http/DailyTrackingController.ts)
* **Authentication**: Required (`Bearer` Token)

---

### GET `/tracking/today-status`
* **What it does**: Checks whether the user has logged meals today (breakfast, lunch, dinner) and calculates the user's current daily streak and historical longest streak (using a 60-day lookup window).
* **Request Header**: `Authorization: Bearer <token>`
* **Response Status**: `200 OK`
* **Response Body**:
  ```json
  {
    "date": "2026-08-24",
    "completed": true,
    "currentStreak": 5,
    "longestStreak": 14
  }
  ```
* **Possible Errors**:
  * `401 Unauthorized` (`MISSING_ACCESS_TOKEN` / `INVALID_ACCESS_TOKEN`)

---

### GET `/tracking/week-progress`
* **What it does**: Returns a 7-day completion status report starting from a specific date.
* **Request Header**: `Authorization: Bearer <token>`
* **Query Parameters**:
  * `weekStart` *(required)*: A date formatted as `YYYY-MM-DD` (e.g. `2026-08-24`)
* **Response Status**: `200 OK`
* **Response Body**:
  ```json
  {
    "2026-08-24": true,
    "2026-08-25": true,
    "2026-08-26": false,
    "2026-08-27": false,
    "2026-08-28": false,
    "2026-08-29": false,
    "2026-08-30": false
  }
  ```
* **Possible Errors**:
  * `400 Bad Request` (`INVALID_QUERY` / `INVALID_WEEK_START`)
  * `401 Unauthorized` (`MISSING_ACCESS_TOKEN` / `INVALID_ACCESS_TOKEN`)

---

## 📁 7. Placeholder Modules (Under Construction)

These endpoints are registered routing groups but currently contain placeholders throwing `NotImplementedError` or are not mounted with active route endpoints yet.

### 📊 Body Analytics Module (`/analytics`)
* **Status**: 🛠️ Placeholder structure.
* **Use Cases**: `GetDailySummary`, `GetWeeklyTrend`, `GenerateMealInsights`.
* **Behavior**: Throwing `Not implemented` errors on call.

### 💬 Chatbot Module (`/chat`)
* **Status**: 🛠️ Placeholder structure.
* **Use Cases**: `SendMessage` (streaming response), `GetConversationHistory`.
* **Behavior**: Throwing `Not implemented` errors on call.

### 🔔 Notifications Module (`/notifications`)
* **Status**: 🛠️ Placeholder structure.
* **Use Cases**: `RegisterDeviceToken` (push notification registrations).
* **Behavior**: Throwing `Not implemented` errors on call.

### 💳 Subscription Module (`/subscription`)
* **Status**: 🛠️ Placeholder structure.
* **Use Cases**: `PurchaseSubscription`, `ValidateReceipt`.
* **Behavior**: Throwing `Not implemented` errors on call.
