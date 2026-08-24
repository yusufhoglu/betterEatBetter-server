# eatBetter Mobile Integration Contract

Date: Sunday, August 23, 2026

This document is the mobile-facing integration contract for the backend features that are currently implemented and ready for client integration. It should be read together with `api-endpoints.md`, but this file focuses only on the mobile-relevant contract changes and decisions.

---

## 1. Authentication

### Implemented

#### POST `/auth/sign-up`
- Creates a user and returns a full session.

Request:
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

Response `201`:
```json
{
  "userId": "uuid",
  "accessToken": "jwt",
  "refreshToken": "opaque-token",
  "refreshTokenExpiresAt": "2026-09-22T00:00:00.000Z"
}
```

#### POST `/auth/sign-in`
- Signs in an existing user and returns a full session.

Request:
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

Response `200`:
```json
{
  "userId": "uuid",
  "accessToken": "jwt",
  "refreshToken": "opaque-token",
  "refreshTokenExpiresAt": "2026-09-22T00:00:00.000Z"
}
```

#### POST `/auth/refresh`
- Rotates the refresh token and returns a new session pair.

Request:
```json
{
  "refreshToken": "opaque-token"
}
```

Response `200`:
```json
{
  "userId": "uuid",
  "accessToken": "jwt",
  "refreshToken": "new-opaque-token",
  "refreshTokenExpiresAt": "2026-09-22T00:00:00.000Z"
}
```

#### POST `/auth/logout`
- Revokes the presented refresh token.

Request:
```json
{
  "refreshToken": "opaque-token"
}
```

Response `204`

#### DELETE `/auth/account`
- Deletes the authenticated account and revokes active sessions.

Headers:
```http
Authorization: Bearer <accessToken>
```

Response `204`

### Not Implemented Yet

#### Social auth
- `POST /auth/apple`
- `POST /auth/google`

Mobile should keep Apple/Google buttons behind a fallback or disabled integration path until these backend endpoints exist.

---

## 2. Onboarding

### Implemented

#### POST `/onboarding/complete`
- Completes onboarding, stores the profile, calculates the active plan, and returns enriched plan data for the onboarding completion screen.

Headers:
```http
Authorization: Bearer <accessToken>
```

Request:
```json
{
  "weightKg": 78.5,
  "targetWeightKg": 70,
  "heightCm": 182,
  "dateOfBirth": "1998-04-21",
  "gender": "male",
  "workoutsPerWeek": 3,
  "goal": "lose",
  "weeklyPaceKg": 0.5
}
```

Notes:
- `dateOfBirth` is now supported and recommended.
- `age` is still accepted for backward compatibility.
- At least one of `dateOfBirth` or `age` must be sent.

Response `201`:
```json
{
  "userId": "uuid",
  "dailyCalories": 2240,
  "proteinG": 168,
  "carbsG": 230,
  "fatG": 72,
  "createdAt": "2026-08-23T00:00:00.000Z",
  "updatedAt": "2026-08-23T00:00:00.000Z",
  "projection": {
    "startWeightKg": 78.5,
    "targetWeightKg": 70,
    "estimatedTargetDate": "2026-11-15T00:00:00.000Z"
  },
  "healthScore": 82
}
```

### Mobile Mapping Notes

- If the UI still stores workout ranges like `"0-2" | "3-5" | "6+"`, mobile must still map them to an integer `workoutsPerWeek`.
- `dateOfBirth` should now be sent directly instead of calculating age on-device whenever possible.

---

## 3. Goal Management

### Implemented

#### PATCH `/goal/goal`
- Updates the active goal inputs and returns the recalculated enriched plan.
- Also supports manual macro override fields.

Headers:
```http
Authorization: Bearer <accessToken>
```

Request example: automatic recalculation
```json
{
  "weightKg": 77.2,
  "targetWeightKg": 70,
  "workoutsPerWeek": 4,
  "goal": "lose",
  "weeklyPaceKg": 0.5
}
```

Request example: manual macro override
```json
{
  "dailyCalories": 2100,
  "proteinG": 180,
  "carbsG": 190,
  "fatG": 62
}
```

Request example: mixed update
```json
{
  "targetWeightKg": 72,
  "workoutsPerWeek": 4,
  "dailyCalories": 2200,
  "proteinG": 175,
  "carbsG": 210,
  "fatG": 70
}
```

Response `200`:
```json
{
  "userId": "uuid",
  "dailyCalories": 2200,
  "proteinG": 175,
  "carbsG": 210,
  "fatG": 70,
  "createdAt": "2026-08-23T00:00:00.000Z",
  "updatedAt": "2026-08-23T00:10:00.000Z",
  "projection": {
    "startWeightKg": 77.2,
    "targetWeightKg": 72,
    "estimatedTargetDate": "2026-10-18T00:00:00.000Z"
  },
  "healthScore": 80
}
```

### Mobile Notes

- If the user edits macros manually, mobile can send the final values directly.
- Macro validation exists server-side. Do not assume every arbitrary combination will be accepted.

---

## 4. Nutrition Logging

### Implemented

#### POST `/nutrition-logs/`
- Appends entries to the existing meal slot for that day and meal type.

Request:
```json
{
  "mealType": "breakfast",
  "timeZone": "Europe/Istanbul",
  "entries": [
    {
      "id": "entry-1",
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

#### PUT `/nutrition-logs/meal-slot`
- Replaces the full meal slot contents for the requested day.
- This is the recommended endpoint when the mobile editor works with the full list for a meal and wants backend state to match exactly.

Request:
```json
{
  "mealType": "breakfast",
  "timeZone": "Europe/Istanbul",
  "date": "2026-08-23",
  "entries": [
    {
      "id": "entry-1",
      "name": "Oats",
      "portionGrams": 80,
      "calories": 300,
      "proteinG": 10,
      "carbsG": 52,
      "fatG": 5
    },
    {
      "id": "entry-2",
      "name": "Milk",
      "portionGrams": 200,
      "calories": 96,
      "proteinG": 6.6,
      "carbsG": 9.6,
      "fatG": 3.2
    }
  ]
}
```

Response `200`:
- Returns the updated `MealItem`.

#### GET `/nutrition-logs/day-summary`
- Now supports a historical `date` query parameter.

Query:
```http
/nutrition-logs/day-summary?timeZone=Europe/Istanbul&date=2026-08-22
```

Notes:
- If `date` is omitted, backend resolves "today" from `timeZone`.
- If `date` is present, backend uses that exact date.

Response `200`:
```json
{
  "userId": "uuid",
  "date": "2026-08-22T00:00:00.000Z",
  "mealItems": [],
  "consumed": {
    "calories": 0,
    "proteinG": 0,
    "carbsG": 0,
    "fatG": 0
  },
  "dailyCalorieGoal": 2240,
  "dailyProteinGoal": 168,
  "dailyCarbsGoal": 230,
  "dailyFatGoal": 72,
  "remainingCalories": 2240,
  "progress": {
    "calories": {
      "consumed": 0,
      "goal": 2240,
      "remaining": 2240,
      "percentage": 0
    },
    "protein": {
      "consumed": 0,
      "goal": 168,
      "remaining": 168,
      "percentage": 0
    },
    "carbs": {
      "consumed": 0,
      "goal": 230,
      "remaining": 230,
      "percentage": 0
    },
    "fat": {
      "consumed": 0,
      "goal": 72,
      "remaining": 72,
      "percentage": 0
    }
  }
}
```

### Not Implemented Yet

#### Water tracking
- No `/days/:date/water` contract exists yet.

#### Recent foods / favorites / my meals
- No backend endpoints exist yet.

---

## 5. Food Photo Upload and Recognition

### Implemented

#### POST `/media/upload`
- Creates a backend-generated `mealPhotoId` and returns a presigned direct-upload URL.
- This is the correct first step for photo recognition.

Headers:
```http
Authorization: Bearer <accessToken>
```

Response `201`:
```json
{
  "mealPhotoId": "a90e3cd2-12a8-4c12-887e-e2c07b469b82",
  "uploadUrl": "https://..."
}
```

#### POST `/food/photo`
- Starts recognition for an already-uploaded photo.

Request:
```json
{
  "mealPhotoId": "a90e3cd2-12a8-4c12-887e-e2c07b469b82"
}
```

Response `202`:
```json
{
  "mealPhotoId": "a90e3cd2-12a8-4c12-887e-e2c07b469b82"
}
```

#### GET `/food/photo/:mealPhotoId`
- Polls the recognition result.

### Required Mobile Flow

1. Call `POST /media/upload`
2. Upload the image bytes directly to `uploadUrl`
3. Call `POST /food/photo` with the returned `mealPhotoId`
4. Poll `GET /food/photo/:mealPhotoId` until the status is final

Final statuses:
- `completed`
- `insufficient_data`
- `failed`

Non-final status:
- `processing`

---

## 6. Still Not Ready for Mobile Backend Integration

These areas still need backend completion before mobile can switch from mocks/local handling:

- Social auth: Apple, Google
- Water tracking
- Recent foods / favorites / my meals
- Analytics module
- Chat module
- Notifications module
- Subscription module

---

## 7. Recommended Mobile Changes

### High Priority

- Switch onboarding payloads to send `dateOfBirth` and `targetWeightKg`
- Read `projection` and `healthScore` from onboarding and goal responses
- Use `PUT /nutrition-logs/meal-slot` for full-slot editor save behavior
- Use `GET /nutrition-logs/day-summary?...&date=YYYY-MM-DD` for historical day screens
- Use `POST /media/upload` before `POST /food/photo`
- Call `POST /auth/logout` on logout
- Call `DELETE /auth/account` for account deletion UX

### Keep Using Client-Side Mapping

- Workout range string to integer mapping still belongs to mobile

