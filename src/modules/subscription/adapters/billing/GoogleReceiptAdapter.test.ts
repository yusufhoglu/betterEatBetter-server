import { JWT } from 'google-auth-library';
import { ValidationError } from '../../../../shared/errors/ValidationError';
import { GoogleReceiptAdapter } from './GoogleReceiptAdapter';

const FAKE_SERVICE_ACCOUNT_JSON = JSON.stringify({
  client_email: 'fake@test.iam.gserviceaccount.com',
  private_key: 'fake-key',
});

function subscriptionPurchaseBody(overrides: {
  subscriptionState: string;
  productId?: string;
  expiryTime?: string;
  autoRenewEnabled?: boolean;
  acknowledgementState?: string;
  linkedPurchaseToken?: string;
}) {
  return {
    subscriptionState: overrides.subscriptionState,
    ...(overrides.acknowledgementState ? { acknowledgementState: overrides.acknowledgementState } : {}),
    ...(overrides.linkedPurchaseToken ? { linkedPurchaseToken: overrides.linkedPurchaseToken } : {}),
    lineItems: [
      {
        productId: overrides.productId ?? 'premium_yearly',
        expiryTime: overrides.expiryTime ?? '2027-01-01T00:00:00.000Z',
        autoRenewingPlan: { autoRenewEnabled: overrides.autoRenewEnabled ?? true },
      },
    ],
  };
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('GoogleReceiptAdapter', () => {
  // getAccessToken has an overloaded (promise vs. callback) signature that
  // defeats jest's SpiedFunction inference — cast to a plain jest.Mock.
  let getAccessTokenSpy: jest.Mock;
  let fetchSpy: jest.SpiedFunction<typeof fetch>;

  beforeEach(() => {
    getAccessTokenSpy = jest.spyOn(JWT.prototype, 'getAccessToken') as unknown as jest.Mock;
    getAccessTokenSpy.mockResolvedValue({ token: 'fake-access-token' });
    fetchSpy = jest.spyOn(global, 'fetch');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function buildAdapter() {
    return new GoogleReceiptAdapter('com.example.app', FAKE_SERVICE_ACCOUNT_JSON);
  }

  test('calls subscriptionsv2 with the package name, token, and bearer auth header', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, subscriptionPurchaseBody({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' })));

    await buildAdapter().validate({ productId: 'premium_yearly', receiptToken: 'purchase-token-123' });

    expect(fetchSpy).toHaveBeenCalledWith(
      'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example.app/purchases/subscriptionsv2/tokens/purchase-token-123',
      { headers: { Authorization: 'Bearer fake-access-token' } },
    );
  });

  test('maps an active subscription to status active with expiry, willRenew, and inGracePeriod', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(200, subscriptionPurchaseBody({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', autoRenewEnabled: true })),
    );

    const result = await buildAdapter().validate({ productId: 'premium_yearly', receiptToken: 'purchase-token-123' });

    expect(result).toEqual({
      productId: 'premium_yearly',
      status: 'active',
      expiresAt: new Date('2027-01-01T00:00:00.000Z'),
      willRenew: true,
      inGracePeriod: false,
      linkedPurchaseToken: null,
    });
  });

  test('a canceled-but-unexpired subscription still maps to status active (access lasts until expiry)', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(200, subscriptionPurchaseBody({ subscriptionState: 'SUBSCRIPTION_STATE_CANCELED', autoRenewEnabled: false })),
    );

    const result = await buildAdapter().validate({ productId: 'premium_yearly', receiptToken: 'purchase-token-123' });

    expect(result.status).toBe('active');
    expect(result.willRenew).toBe(false);
  });

  test('maps SUBSCRIPTION_STATE_ON_HOLD to status canceled (no access during hold)', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, subscriptionPurchaseBody({ subscriptionState: 'SUBSCRIPTION_STATE_ON_HOLD' })));

    const result = await buildAdapter().validate({ productId: 'premium_yearly', receiptToken: 'purchase-token-123' });

    expect(result.status).toBe('canceled');
  });

  test('throws ValidationError INVALID_TOKEN when the response productId does not match the claimed productId', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(200, subscriptionPurchaseBody({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', productId: 'premium_monthly' })),
    );

    await expect(
      buildAdapter().validate({ productId: 'premium_yearly', receiptToken: 'purchase-token-123' }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
  });

  test('throws ValidationError INVALID_TOKEN for a 404 (unknown purchase token)', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(404, { error: 'not found' }));

    await expect(
      buildAdapter().validate({ productId: 'premium_yearly', receiptToken: 'bad-token' }),
    ).rejects.toMatchObject({ code: 'INVALID_TOKEN' });
    await expect(buildAdapter().validate({ productId: 'premium_yearly', receiptToken: 'bad-token' })).rejects.toThrow(
      ValidationError,
    );
  });

  test('throws a retryable IntegrationError PLAY_API_ERROR for a 500', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(500, { error: 'server error' }));

    await expect(buildAdapter().validate({ productId: 'premium_yearly', receiptToken: 'token' })).rejects.toMatchObject({
      code: 'PLAY_API_ERROR',
      retryable: true,
    });
  });

  test('throws a retryable IntegrationError PLAY_API_ERROR on a network failure', async () => {
    fetchSpy.mockRejectedValue(new Error('network down'));

    await expect(buildAdapter().validate({ productId: 'premium_yearly', receiptToken: 'token' })).rejects.toMatchObject({
      code: 'PLAY_API_ERROR',
      retryable: true,
    });
  });

  test('throws a non-retryable IntegrationError PLAY_API_ERROR when access-token auth fails', async () => {
    getAccessTokenSpy.mockRejectedValue(new Error('bad credentials'));

    await expect(buildAdapter().validate({ productId: 'premium_yearly', receiptToken: 'token' })).rejects.toMatchObject({
      code: 'PLAY_API_ERROR',
    });
  });

  test('acknowledges server-side when the purchase is active and pending acknowledgement', async () => {
    fetchSpy.mockImplementation(async (input) => {
      if (String(input).endsWith(':acknowledge')) {
        return jsonResponse(200, {});
      }
      return jsonResponse(
        200,
        subscriptionPurchaseBody({
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
        }),
      );
    });

    const result = await buildAdapter().validate({ productId: 'premium_yearly', receiptToken: 'purchase-token-123' });

    expect(result.status).toBe('active');
    expect(fetchSpy).toHaveBeenCalledWith(
      'https://androidpublisher.googleapis.com/androidpublisher/v3/applications/com.example.app/purchases/subscriptions/premium_yearly/tokens/purchase-token-123:acknowledge',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  test('does not acknowledge when the purchase is already acknowledged', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(
        200,
        subscriptionPurchaseBody({
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          acknowledgementState: 'ACKNOWLEDGEMENT_STATE_ACKNOWLEDGED',
        }),
      ),
    );

    await buildAdapter().validate({ productId: 'premium_yearly', receiptToken: 'purchase-token-123' });

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).not.toHaveBeenCalledWith(expect.stringContaining(':acknowledge'), expect.anything());
  });

  test('a failed acknowledgement never fails verification', async () => {
    fetchSpy.mockImplementation(async (input) => {
      if (String(input).endsWith(':acknowledge')) {
        return jsonResponse(400, { error: 'already acknowledged' });
      }
      return jsonResponse(
        200,
        subscriptionPurchaseBody({
          subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE',
          acknowledgementState: 'ACKNOWLEDGEMENT_STATE_PENDING',
        }),
      );
    });

    const result = await buildAdapter().validate({ productId: 'premium_yearly', receiptToken: 'purchase-token-123' });

    expect(result.status).toBe('active');
  });

  test('surfaces linkedPurchaseToken when Google reports the purchase supersedes a prior one', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(
        200,
        subscriptionPurchaseBody({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', linkedPurchaseToken: 'old-token' }),
      ),
    );

    const result = await buildAdapter().validate({ productId: 'premium_yearly', receiptToken: 'purchase-token-123' });

    expect(result.linkedPurchaseToken).toBe('old-token');
  });

  test('returns null linkedPurchaseToken for a first-time purchase', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, subscriptionPurchaseBody({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE' })));

    const result = await buildAdapter().validate({ productId: 'premium_yearly', receiptToken: 'purchase-token-123' });

    expect(result.linkedPurchaseToken).toBeNull();
  });

  test('looks up a purchaseToken without a claimed productId, skipping the cross-check (RTDN reconcile of an unknown token)', async () => {
    fetchSpy.mockResolvedValue(
      jsonResponse(
        200,
        subscriptionPurchaseBody({ subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', productId: 'premium_yearly' }),
      ),
    );

    const result = await buildAdapter().validate({ receiptToken: 'purchase-token-123' });

    expect(result.productId).toBe('premium_yearly');
  });

  test('throws PLAY_API_ERROR when no productId is claimed and Google returns no line items to resolve one from', async () => {
    fetchSpy.mockResolvedValue(jsonResponse(200, { subscriptionState: 'SUBSCRIPTION_STATE_ACTIVE', lineItems: [] }));

    await expect(buildAdapter().validate({ receiptToken: 'purchase-token-123' })).rejects.toMatchObject({
      code: 'PLAY_API_ERROR',
    });
  });
});
