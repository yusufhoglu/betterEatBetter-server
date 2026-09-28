# admin module

Platform-level administration for the operator (not clinics — those use the
practice module's owner/admin roles).

## Who is an admin
`PLATFORM_ADMIN_EMAILS` (comma-separated, case-insensitive). Every `/admin/*`
route runs `authMiddleware` then `AdminController.requireAdmin`; anyone else
gets `403 NOT_PLATFORM_ADMIN`. No database role — changing admins is an env
change + restart.

## Privacy
Admin reads are summary-level only: account info, dates, counts (days with a
meal log, weigh-in count, messages sent), AI token usage and photo-scan counts.
Never meal contents, weights, water amounts or chat text. Detailed client data
stays behind the dietitian's consent-scoped practice endpoints.

## AI usage accounting
LLM providers call `emitLlmUsage` (shared/llm/usageSink) after every call; the
user comes from the request trace context (null for background work).
`BufferedAiUsageRecorder` batches rows into `ai_usage_events` every 2 s — a
crash loses at most one batch; this is reporting, not billing. Photo
recognition runs in the external RAG service (no token counts), so it is
reported as scan counts from `food_entries`.

## Actions (all written to `admin_audit_logs`)
| Action | Effect |
|---|---|
| user.suspend / unsuspend | `users.suspendedAt`; suspension revokes all refresh tokens. `SuspensionGuardedRefreshTokens` blocks new sessions and refreshes (`403 ACCOUNT_SUSPENDED`). An open session ends when its access token expires (≤ `JWT_ACCESS_TOKEN_TTL_SECONDS`). |
| premium.grant / revoke | Manual `admin_grant` subscription (same as `npm run grant:premium`). Revoke cancels only that row; store subscriptions are untouched. Entitlement cache is cleared. |
| dietitian.suspend / unsuspend | All memberships ↔ `suspended`. The dietitian drops out of the panel, loses client-data access (ClientAccessPolicy requires an active membership) and cannot take new invites. Links stay; unsuspend restores everything. |
| client.reassign | practice `AdminReassignClient`: moves the link into the new dietitian's organization, consent carries over, the chat thread swaps participants and posts a system message. |
| code.create / revoke | Dietitian activation codes (solo practice). The plain code is returned once; only its hash is stored and it never appears in the audit log. Clinic codes remain a CLI concern (`npm run practice:activation-code`). |
