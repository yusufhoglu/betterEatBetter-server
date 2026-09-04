import { JWT } from 'google-auth-library';
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

interface ServiceAccount {
  client_email: string;
  private_key: string;
  project_id?: string;
}

/** Sends a single notification via the FCM HTTP v1 API (Android device tokens). */
export class FcmPushAdapter implements PushSenderPort {
  private readonly jwtClient: JWT;
  private readonly projectId: string;
  private readonly policy: IPolicy;

  constructor(
    serviceAccountJson: string | undefined = env.FCM_SERVICE_ACCOUNT_JSON,
    projectId: string | undefined = env.FCM_PROJECT_ID,
    policy?: IPolicy,
  ) {
    if (!serviceAccountJson) {
      throw new Error('FCM_SERVICE_ACCOUNT_JSON is required to build FcmPushAdapter');
    }

    const credentials = JSON.parse(serviceAccountJson) as ServiceAccount;
    this.projectId = projectId ?? credentials.project_id ?? '';
    if (!this.projectId) {
      throw new Error('FCM project id missing — set FCM_PROJECT_ID or include project_id in the service account JSON');
    }

    this.jwtClient = new JWT({
      email: credentials.client_email,
      key: credentials.private_key,
      scopes: [FCM_MESSAGING_SCOPE],
    });

    this.policy =
      policy ??
      buildResiliencePolicy({ timeoutMs: TIMEOUT_MS, circuitBreakerThreshold: 5, retryAttempts: 2 });
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

  private async doSend(message: PushMessage): Promise<PushSendResult> {
    let accessToken: string | null | undefined;
    try {
      ({ token: accessToken } = await this.jwtClient.getAccessToken());
    } catch (err) {
      logger.error({ err }, 'failed to obtain FCM access token');
      throw new IntegrationError('FCM_AUTH_ERROR', 'Could not authenticate with FCM', true);
    }

    let response: Response;
    try {
      response = await fetch(`https://fcm.googleapis.com/v1/projects/${this.projectId}/messages:send`, {
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
