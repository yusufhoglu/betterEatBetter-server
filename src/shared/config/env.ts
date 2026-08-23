// TODO: Ortam degiskenlerini okuyup dogrulayan (zod ile) tek nokta
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.string().default('development'),
});

export const env = envSchema.parse(process.env);
