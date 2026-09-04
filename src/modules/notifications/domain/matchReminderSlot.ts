import { ValidationError } from '../../../shared/errors/ValidationError';

const HH_MM = /^([0-1]\d|2[0-3]):([0-5]\d)$/;

/** Parses a stored `"HH:MM"` preference into minutes past local midnight. */
export function parseHhMm(value: string): number {
  const match = HH_MM.exec(value.trim());
  if (!match) {
    throw new ValidationError('INVALID_REMINDER_TIME', `Reminder time "${value}" is not HH:MM`);
  }
  return Number(match[1]) * 60 + Number(match[2]);
}

/**
 * True when the current local time falls inside the half-open slot
 * `[target, target + slotWidthMinutes)`. The meal-reminder cron runs every
 * `slotWidthMinutes` minutes, so exactly one run per day matches each target
 * (a Redis guard key still backstops overlapping runs).
 */
export function matchReminderSlot(
  local: { hour: number; minute: number },
  targetHhMm: string,
  slotWidthMinutes: number,
): boolean {
  const nowMinutes = local.hour * 60 + local.minute;
  const targetMinutes = parseHhMm(targetHhMm);
  return nowMinutes >= targetMinutes && nowMinutes < targetMinutes + slotWidthMinutes;
}
