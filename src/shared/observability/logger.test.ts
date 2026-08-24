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
});
