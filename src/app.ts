import sensible from '@fastify/sensible';
import Fastify, { type FastifyInstance } from 'fastify';

import type { Env } from './config/env.js';
import authPlugin from './plugins/auth.js';
import errorHandlerPlugin from './plugins/error-handler.js';
import rateLimitPlugin from './plugins/rate-limit.js';
import swaggerPlugin from './plugins/swagger.js';

import { getPrismaClient } from './db/prisma-client.js';
import authRoutes from './modules/auth/auth.routes.js';
import { AuthService, type DemoUser } from './modules/auth/auth.service.js';
import { PrismaLocationsRepository } from './modules/locations/locations.repository.js';
import locationsRoutes from './modules/locations/locations.routes.js';
import { LocationsService } from './modules/locations/locations.service.js';

export interface BuildAppOptions {
  env: Env;
}

export async function buildApp({ env }: BuildAppOptions): Promise<FastifyInstance> {
  const loggerOptions =
    env.NODE_ENV === 'development'
      ? { level: env.LOG_LEVEL, transport: { target: 'pino-pretty' } }
      : { level: env.LOG_LEVEL };

  const fastify = Fastify({
    logger: loggerOptions,
    ajv: {
      customOptions: {
        removeAdditional: false,
        coerceTypes: true,
        useDefaults: true,
        allErrors: true,
      },
    },
  });

  await fastify.register(sensible);
  await fastify.register(errorHandlerPlugin);
  await fastify.register(swaggerPlugin);
  await fastify.register(rateLimitPlugin);
  await fastify.register(authPlugin, {
    secret: env.JWT_SECRET,
    expiresIn: env.JWT_EXPIRES_IN,
  });

  // PostgreSQL (via Prisma) is the only runtime datasource - see PrismaLocationsRepository's
  // docstring for the RDBMS-portability contract that follows from that.
  const prisma = getPrismaClient();
  fastify.addHook('onClose', async () => {
    await prisma.$disconnect();
  });

  const repository = await PrismaLocationsRepository.load(prisma);
  const locationsService = new LocationsService(repository);

  const demoUsers: DemoUser[] = [
    { username: env.DEMO_ADMIN_USERNAME, password: env.DEMO_ADMIN_PASSWORD, role: 'admin' },
    { username: env.DEMO_USER_USERNAME, password: env.DEMO_USER_PASSWORD, role: 'user' },
  ];
  const authService = new AuthService(demoUsers);

  fastify.get('/health', { schema: { tags: ['health'], hide: true } }, async (_request, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch (error) {
      fastify.log.error({ err: error }, 'Health check failed: database unreachable');
      return reply.code(503).send({ status: 'error', message: 'Database unreachable' });
    }
  });

  await fastify.register(authRoutes, {
    prefix: '/auth',
    authService,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
  });

  await fastify.register(locationsRoutes, {
    prefix: '/locations',
    locationsService,
    writeRateLimit: {
      max: env.WRITE_RATE_LIMIT_MAX,
      timeWindow: env.WRITE_RATE_LIMIT_WINDOW,
    },
  });

  return fastify;
}
