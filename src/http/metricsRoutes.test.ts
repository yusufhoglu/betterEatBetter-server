const envMock: { NODE_ENV: string; LOG_LEVEL: string; METRICS_TOKEN?: string } = {
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
};

jest.mock('../shared/config/env', () => ({ env: envMock }));

// eslint-disable-next-line import/first
import express from 'express';
// eslint-disable-next-line import/first
import request from 'supertest';
// eslint-disable-next-line import/first
import { metricsRoutes } from './metricsRoutes';

function app() {
  const instance = express();
  instance.use(metricsRoutes());
  return instance;
}

describe('GET /metrics', () => {
  beforeEach(() => {
    delete envMock.METRICS_TOKEN;
  });

  it('returns 404 while METRICS_TOKEN is unset (feature off, existence not advertised)', async () => {
    await request(app()).get('/metrics').expect(404);
  });

  it('returns 401 when the bearer token is missing or wrong', async () => {
    envMock.METRICS_TOKEN = 'scrape-secret';
    await request(app()).get('/metrics').expect(401);
    await request(app()).get('/metrics').set('Authorization', 'Bearer wrong').expect(401);
  });

  it('serves the Prometheus exposition format with the correct token', async () => {
    envMock.METRICS_TOKEN = 'scrape-secret';
    const res = await request(app())
      .get('/metrics')
      .set('Authorization', 'Bearer scrape-secret')
      .expect(200);

    expect(res.headers['content-type']).toContain('text/plain');
    expect(res.text).toContain('# HELP');
    expect(res.text).toContain('dietician_turn_duration_seconds');
  });
});
