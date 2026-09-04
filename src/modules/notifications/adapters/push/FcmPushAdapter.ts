import { GoogleAuth } from 'google-auth-library';
import type { IPolicy } from 'cockatiel';
import { env } from '../../../../shared/config/env';
import { DomainError } from '../../../../shared/errors/DomainError';
import { IntegrationError } from '../../../../shared/errors/IntegrationError';
import { createModuleLogger } from '../../../../shared/observability/logger';
import { buildResiliencePolicy } from '../../../../shared/resilience/policies';
import type { PushMessage, PushSenderPort, PushSendResult } from '../../ports/PushSenderPort';

const logger = createModuleLogger('notifications');

const FCM_MESSAGING_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const TIMEOUT_MS = 10_000;

/**
 * Sends a single notification via the FCM HTTP v1 API. Handles both Android
 * (FCM registration tokens) and iOS (FCM tokens that FCM relays to APNs) — the
 * mobile app obtains both from `firebase_messaging`.
 *
 * Credentials resolve through `GoogleAuth`, in order:
 *   1. `FCM_SERVICE_ACCOUNT_JSON` if set (inline JSON — handy for local/CI)
 *   2. `GOOGLE_APPLICATION_CREDENTIALS` file path
 *   3. gcloud Application Default Credentials (`gcloud auth application-default login`)
 *   4. GCP metadata server (Cloud Run / GCE / GKE)
 * so no service-account key file is required when running on GCP.
 */
export class FcmPushAdapter implements PushSenderPort {
  private readonly auth: GoogleAuth;
  private readonly policy: IPolicy;
  private projectIdPromise: Promise<string> | undefined;

  constructor(
    serviceAccountJson: string | undefined = env.FCM_SERVICE_ACCOUNT_JSON,
    private readonly configuredProjectId: string | undefined = env.FCM_PROJECT_ID,
    policy?: IPolicy,
  ) {
    this.auth = new GoogleAuth({
      scopes: [FCM_MESSAGING_SCOPE],
      ...(serviceAccountJson ? { credentials: JSON.parse(serviceAccountJson) } : {}),
    });

    this.policy =
      policy ?? buildResiliencePolicy({ timeoutMs: TIMEOUT_MS, circuitBreakerThreshold: 5, retryAttempts: 2 });
  }

  async send(message: PushMessage): Promise<PushSendResult> {
    try {
      return await this.policy.execute(() => this.doSend(message));
    } catch (err) {
      if (err instanceof IntegrationError) {
        return { status: 'error', retryable: err.retryable, reason: err.code };
      }
      if (err instanceof DomainError) {
        return { status: 'error', retryable: false, reason: err.code };
      }
      logger.warn({ err }, 'FCM send failed (circuit open or timeout)');
      return { status: 'error', retryable: false, reason: 'FCM_UNAVAILABLE' };
    }
  }

  private async resolveProjectId(): Promise<string> {
    if (this.configuredProjectId) {
      return this.configuredProjectId;
    }
    this.projectIdPromise ??= this.auth.getProjectId();
    const projectId = await this.projectIdPromise;
    if (!projectId) {
      throw new IntegrationError('FCM_AUTH_ERROR', 'Could not resolve the FCM project id', false);
    }
    return projectId;
  }

  private async doSend(message: PushMessage): Promise<PushSendResult> {
    let accessToken: string | null | undefined;
    let projectId: string;
    try {
      [accessToken, projectId] = await Promise.all([this.auth.getAccessToken(), this.resolveProjectId()]);
    } catch (err) {
      if (err instanceof IntegrationError) {
        throw err;
      }
      logger.error({ err }, 'failed to obtain FCM access token');
      throw new IntegrationError('FCM_AUTH_ERROR', 'Could not authenticate with FCM', true);
    }

    let response: Response;
    try {
      response = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: {
            token: message.token,
            notification: { title: message.title, body: message.body },
            ...(message.data ? { data: message.data } : {}),
          },
        }),
      });
    } catch (err) {
      logger.error({ err }, 'FCM network error');
      throw new IntegrationError('FCM_NETWORK_ERROR', 'Could not reach FCM', true);
    }

    if (response.ok) {
      return { status: 'sent' };
    }

    const body = (await response.json().catch(() => ({}))) as {
      error?: { status?: string; message?: string; details?: Array<{ errorCode?: string }> };
    };
    const fcmErrorCode = body.error?.details?.find((detail) => detail.errorCode)?.errorCode;

    if (response.status === 404 || fcmErrorCode === 'UNREGISTERED' || body.error?.status === 'NOT_FOUND') {
      return { status: 'invalid_token' };
    }

    if (response.status === 400) {
      logger.warn({ fcmErrorCode, message: body.error?.message }, 'FCM rejected message as invalid');
      return { status: 'invalid_token' };
    }

    const retryable = response.status === 429 || response.status >= 500;
    throw new IntegrationError('FCM_SEND_ERROR', `FCM returned ${response.status}`, retryable);
  }
}
