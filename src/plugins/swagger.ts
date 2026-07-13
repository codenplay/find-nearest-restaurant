import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync } from 'fastify';

const swaggerPlugin: FastifyPluginAsync = async (fastify) => {
  await fastify.register(swagger, {
    openapi: {
      openapi: '3.0.3',
      info: {
        title: 'Find Nearest Restaurant API',
        description:
          'API for discovering restaurants visible from a given user location, and managing restaurant records.',
        version: '1.0.0',
      },
      servers: [{ url: '/', description: 'Current server' }],
      tags: [
        { name: 'auth', description: 'Authentication' },
        { name: 'locations', description: 'Restaurant search and management' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
        },
      },
    },
  });

  await fastify.register(swaggerUi, {
    routePrefix: '/docs',
  });
};

export default fp(swaggerPlugin, { name: 'swagger-plugin' });
