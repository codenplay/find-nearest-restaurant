import 'dotenv/config';

import closeWithGrace from 'close-with-grace';

import { buildApp } from './app.js';
import { loadEnv } from './config/env.js';

async function main(): Promise<void> {
  const env = loadEnv();
  const app = await buildApp({ env });

  closeWithGrace({ delay: 5000 }, async ({ err }) => {
    if (err) {
      app.log.error({ err }, 'Closing application due to an unhandled error');
    }
    await app.close();
  });

  await app.listen({ host: env.HOST, port: env.PORT });
}

main().catch((error) => {
  console.error('Failed to start the server:', error);
  process.exitCode = 1;
});
