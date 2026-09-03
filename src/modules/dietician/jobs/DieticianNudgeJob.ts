// DEFERRED — designed, not implemented this round (see dietician-rule.md + the
// feature plan). Blocked on the notifications module's device-token
// registration (RegisterDeviceToken is still a placeholder) and a `me`
// notification-preferences read port.
//
// Intended design:
//   - BullMQ repeatable job (hourly) registered via shared/scheduling.
//   - Eligible users = has an active plan AND has logged fewer meals than
//     expected for their local time-of-day (compare NotificationPreference
//     breakfast/lunch/dinner times against nutrition-logging's logged meal
//     types for today).
//   - Respect NotificationPreference.masterEnabled + per-slot flags + timezone.
//   - Dedup: one nudge per user per meal slot per local day
//     (Redis key `dietician:nudge:<userId>:<yyyy-mm-dd>:<slot>`).
//   - Copy: cheap-tier LLM (feature 'dietician:nudge') or a static template.
//   - Delivery: notifications/PushSenderPort.
//   - Side effect: append the nudge into the user's latest dietician
//     conversation as role:'assistant', origin:'proactive' so it shows in the
//     thread and feeds the next turn's context.
export async function DieticianNudgeJob(): Promise<void> {
  throw new Error('Not implemented: DieticianNudgeJob (deferred — see dietician-rule.md)');
}
