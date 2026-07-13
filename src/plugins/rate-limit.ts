import rateLimit from '@fastify/rate-limit';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

/**
 * Registers a generous global rate limit as a baseline DoS guard. Write endpoints layer a
 * much stricter, route-specific limit on top via `config.rateLimit` (see locations.routes.ts),
 * since those are the ones that mutate shared state and hit disk.
 */
const rateLimitPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
  });
};

export default fp(rateLimitPlugin, { name: 'rate-limit-plugin' });
