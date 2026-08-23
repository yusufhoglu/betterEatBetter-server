// TODO: tum modulleri wiring eder, sunucuyu baslatir
import express from 'express';
import { createRouter } from './http/router';
import { env } from './shared/config/env';
import { logger } from './shared/observability/logger';

const app = express();

app.use(express.json());
app.use(createRouter());

const port = Number(process.env.PORT ?? 3000);

app.listen(port, () => {
  logger.info({ port, env: env.NODE_ENV }, 'server started');
});
