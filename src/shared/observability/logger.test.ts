// Neutralise dotenv so an isolated re-import of ../config/env cannot repopulate
// LOKI_* from a developer's local .env (CI has no .env, so this only bites locally).
jest.mock('dotenv/config', () => ({}));

describe('logger', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalLokiUrl = process.env.LOKI_URL;
  const originalLokiUserId = process.env.LOKI_USER_ID;
  const originalLokiApiToken = process.env.LOKI_API_TOKEN;

  afterEach(() => {
    jest.resetModules();
    jest.clearAllMocks();

    if (originalNodeEnv === undefined) {
      delete process.env.NODE_ENV;
    } else {
      process.env.NODE_ENV = originalNodeEnv;
    }

    if (originalLokiUrl === undefined) {
      delete process.env.LOKI_URL;
    } else {
      process.env.LOKI_URL = originalLokiUrl;
    }

    if (originalLokiUserId === undefined) {
      delete process.env.LOKI_USER_ID;
    } else {
      process.env.LOKI_USER_ID = originalLokiUserId;
    }

    if (originalLokiApiToken === undefined) {
      delete process.env.LOKI_API_TOKEN;
    } else {
      process.env.LOKI_API_TOKEN = originalLokiApiToken;
    }
  });

  it('keeps normal logger setup when LOKI_URL is not set', () => {
    delete process.env.LOKI_URL;
    delete process.env.LOKI_USER_ID;
    delete process.env.LOKI_API_TOKEN;
    process.env.NODE_ENV = 'test';

    const childLogger = { info: jest.fn() };
    const childMock = jest.fn(() => childLogger);
    const transportMock = jest.fn((config) => ({ config }));
    const pinoMock = Object.assign(jest.fn(() => ({ child: childMock })), {
      transport: transportMock,
    });

    jest.doMock('pino', () => ({
      __esModule: true,
      default: pinoMock,
    }));

    jest.isolateModules(() => {
      const loggerModule = require('./logger') as typeof import('./logger');

      expect(loggerModule.logger).toBe(childLogger);
      expect(transportMock).toHaveBeenCalledTimes(1);
      expect(transportMock).toHaveBeenCalledWith({
        targets: [
          {
            target: 'pino-pretty',
            options: {
              colorize: true,
              destination: 1,
              translateTime: 'SYS:standard',
            },
          },
        ],
      });
      expect(childMock).toHaveBeenCalledWith({ module: 'app' });
      expect(pinoMock).toHaveBeenCalledTimes(1);
    });
  });

  it('configures Loki transport with explicit auth and batching when LOKI_URL is set', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOKI_URL = 'https://logs-prod-us-central1.grafana.net';
    process.env.LOKI_USER_ID = '123456';
    process.env.LOKI_API_TOKEN = 'secret-token';

    const childLogger = { info: jest.fn() };
    const childMock = jest.fn(() => childLogger);
    const transportInstance = { flushSync: jest.fn(), end: jest.fn() };
    const transportMock = jest.fn(() => transportInstance);
    const pinoInstance = { child: childMock, flush: jest.fn() };
    const pinoMock = Object.assign(jest.fn(() => pinoInstance), {
      transport: transportMock,
    });

    jest.doMock('pino', () => ({
      __esModule: true,
      default: pinoMock,
    }));

    jest.isolateModules(() => {
      require('./logger');

      expect(transportMock).toHaveBeenCalledWith({
        targets: [
          {
            target: 'pino/file',
            options: { destination: 1 },
          },
          {
            target: 'pino-loki',
            options: {
              host: 'https://logs-prod-us-central1.grafana.net',
              basicAuth: {
                username: '123456',
                password: 'secret-token',
              },
              labels: {
                service: 'node-backend',
                environment: 'production',
              },
              batching: {
                interval: 5,
                maxBufferSize: 10000,
              },
              timeout: 30000,
              silenceErrors: false,
            },
          },
        ],
      });
      expect(pinoMock).toHaveBeenCalledWith(
        expect.objectContaining({ level: expect.any(String), redact: expect.any(Object), mixin: expect.any(Function) }),
        transportInstance,
      );
    });
  });

  it('fails fast when LOKI_URL is set without auth or with push endpoint suffix', () => {
    process.env.LOKI_URL = 'https://logs-prod-us-central1.grafana.net/loki/api/v1/push';
    delete process.env.LOKI_USER_ID;
    delete process.env.LOKI_API_TOKEN;

    expect(() => {
      jest.isolateModules(() => {
        require('../config/env');
      });
    }).toThrow(/LOKI_URL must be the Loki base host|LOKI_USER_ID is required when LOKI_URL is set|LOKI_API_TOKEN is required when LOKI_URL is set/);
  });
});
