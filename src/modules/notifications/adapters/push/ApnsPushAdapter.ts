import http2 from 'node:http2';
import type { IPolicy } from 'cockatiel';
import jwt from 'jsonwebtoken';
import { env } from '../../../../shared/config/env';
import { DomainError } from '../../../../shared/errors/DomainError';
import { IntegrationError } from '../../../../shared/errors/IntegrationError';
import { createModuleLogger } from '../../../../shared/observability/logger';
import { buildResiliencePolicy } from '../../../../shared/resilience/policies';
import type { PushMessage, PushSenderPort, PushSendResult } from '../../ports/PushSenderPort';

const logger = createModuleLogger('notifications');

const TIMEOUT_MS = 10_000;
// Apple rejects provider tokens older than 1h and throttles refreshes that
// happen more than ~once per 20 min — refresh at 45 min.
const TOKEN_TTL_MS = 45 * 60 * 1000;

const HOSTS = {
  production: 'https://api.push.apple.com',
  sandbox: 'https://api.sandbox.push.apple.com',
} as const;

/** Reasons that mean "this device token is dead" — the row should be pruned. */
const INVALID_TOKEN_REASONS = new Set(['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic', 'ExpiredToken']);

export interface ApnsConfig {
  keyId: string;
  teamId: string;
  authKey: string;
  bundleId: string;
  environment: 'production' | 'sandbox';
}

function configFromEnv(): ApnsConfig {
  if (!env.APNS_KEY_ID || !env.APNS_TEAM_ID || !env.APNS_AUTH_KEY || !env.APNS_BUNDLE_ID) {
    throw new Error('APNS_KEY_ID / APNS_TEAM_ID / APNS_AUTH_KEY / APNS_BUNDLE_ID are required to build ApnsPushAdapter');
  }
  return {
    keyId: env.APNS_KEY_ID,
    teamId: env.APNS_TEAM_ID,
    authKey: env.APNS_AUTH_KEY,
    bundleId: env.APNS_BUNDLE_ID,
    environment: env.APNS_ENVIRONMENT,
  };
}

/** Sends a single notification to APNs over HTTP/2 (iOS device tokens). */
export class ApnsPushAdapter implements PushSenderPort {
  private readonly config: ApnsConfig;
  private readonly host: string;
  private readonly policy: IPolicy;
  private session: http2.ClientHttp2Session | null = null;
  private cachedJwt: { value: string; mintedAt: number } | null = null;

  constructor(config: ApnsConfig = configFromEnv(), policy?: IPolicy) {
    this.config = config;
    this.host = HOSTS[config.environment];
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
      logger.warn({ err }, 'APNs send failed (circuit open or timeout)');
      return { status: 'error', retryable: false, reason: 'APNS_UNAVAILABLE' };
    }
  }

  /** Closes the shared HTTP/2 session — call on graceful shutdown. */
  close(): void {
    this.session?.close();
    this.session = null;
  }

  private providerJwt(): string {
    const now = Date.now();
    if (this.cachedJwt && now - this.cachedJwt.mintedAt < TOKEN_TTL_MS) {
      return this.cachedJwt.value;
    }

    const value = jwt.sign({}, this.config.authKey, {
      algorithm: 'ES256',
      issuer: this.config.teamId,
      keyid: this.config.keyId,
      expiresIn: '55m',
    });
    this.cachedJwt = { value, mintedAt: now };
    return value;
  }

  private getSession(): http2.ClientHttp2Session {
    if (this.session && !this.session.closed && !this.session.destroyed) {
      return this.session;
    }

    const session = http2.connect(this.host);
    session.on('error', (err) => {
      logger.warn({ err }, 'APNs HTTP/2 session error');
      if (this.session === session) {
        this.session = null;
      }
    });
    session.on('close', () => {
      if (this.session === session) {
        this.session = null;
      }
    });
    this.session = session;
    return session;
  }

  private async doSend(message: PushMessage): Promise<PushSendResult> {
    const payload = JSON.stringify({
      aps: { alert: { title: message.title, body: message.body }, sound: 'default' },
      ...(message.data ?? {}),
    });

    let status: number;
    let body: string;
    try {
      ({ status, body } = await this.request(message.token, payload));
    } catch (err) {
      logger.error({ err }, 'APNs request failed');
      throw new IntegrationError('APNS_NETWORK_ERROR', 'Could not reach APNs', true);
    }

    if (status === 200) {
      return { status: 'sent' };
    }

    const reason = safeReason(body);
    if (status === 410 || (status === 400 && reason !== null && INVALID_TOKEN_REASONS.has(reason))) {
      return { status: 'invalid_token' };
    }

    const retryable = status === 429 || status >= 500;
    throw new IntegrationError('APNS_SEND_ERROR', `APNs returned ${status} (${reason ?? 'unknown'})`, retryable);
  }

  private request(deviceToken: string, payload: string): Promise<{ status: number; body: string }> {
    return new Promise((resolve, reject) => {
      const session = this.getSession();
      const stream = session.request({
        ':method': 'POST',
        ':path': `/3/device/${deviceToken}`,
        authorization: `bearer ${this.providerJwt()}`,
        'apns-topic': this.config.bundleId,
        'apns-push-type': 'alert',
        'content-type': 'application/json',
      });

      let status = 0;
      const chunks: Buffer[] = [];

      stream.setTimeout(TIMEOUT_MS, () => stream.destroy(new Error('APNs stream timeout')));
      stream.on('response', (headers) => {
        status = Number(headers[':status'] ?? 0);
      });
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('end', () => resolve({ status, body: Buffer.concat(chunks).toString('utf8') }));
      stream.on('error', reject);

      stream.end(payload);
    });
  }
}

function safeReason(body: string): string | null {
  try {
    const parsed = JSON.parse(body) as { reason?: string };
    return parsed.reason ?? null;
  } catch {
    return null;
  }
}
