/**
 * Throwaway helper: send ONE push to a device token, with the `data` block the
 * Firebase console's "Send test message" UI won't let you add. Use it to verify
 * tap-routing (meal_reminder -> Today tab, weekly_report -> Analytics, etc.).
 *
 * Run from this directory (needs `google-auth-library`, already a backend dep):
 *
 *   node send-test-push.mjs <service-account.json> <device-token> [type] [meal]
 *
 * - <service-account.json>: Firebase console -> Project settings -> Service
 *   accounts -> Generate new private key. Save the file, pass its path.
 * - <device-token>: the `[push] FCM token: ...` line from the app's logs, or a
 *   row in the `device_tokens` table.
 * - [type]: meal_reminder (default) | streak_saver | weekly_report
 * - [meal]: breakfast | lunch (default) | dinner | snack  (only for meal_reminder)
 *
 * Not committed — delete it or add to .gitignore when done.
 */
import { readFileSync } from 'node:fs';
import { JWT } from 'google-auth-library';

const [keyPath, deviceToken, type = 'meal_reminder', meal = 'lunch'] = process.argv.slice(2);

if (!keyPath || !deviceToken) {
  console.error('usage: node send-test-push.mjs <service-account.json> <device-token> [type] [meal]');
  process.exit(1);
}

const sa = JSON.parse(readFileSync(keyPath, 'utf8'));

const jwt = new JWT({
  email: sa.client_email,
  key: sa.private_key,
  scopes: ['https://www.googleapis.com/auth/firebase.messaging'],
});
const { access_token: accessToken } = await jwt.authorize();

const titles = {
  meal_reminder: ['Time to log your meal', `Don't forget to log ${meal}`],
  streak_saver: ['Keep your streak alive', 'Log something today so you don’t lose your streak'],
  weekly_report: ['Your week in review', 'Tap to see your weekly summary'],
};
const [title, body] = titles[type] ?? titles.meal_reminder;

const message = {
  message: {
    token: deviceToken,
    notification: { title, body },
    data: { type, ...(type === 'meal_reminder' ? { meal } : {}) },
    android: { priority: 'high' },
  },
};

const res = await fetch(`https://fcm.googleapis.com/v1/projects/${sa.project_id}/messages:send`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(message),
});

console.log(res.status, await res.text());
