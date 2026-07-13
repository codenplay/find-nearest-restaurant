import jwt from '@fastify/jwt';
import fp from 'fastify-plugin';
import type { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';

import type { Role } from '../types/index.js';

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      ...roles: Role[]
    ) => (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

/**
 * Registers @fastify/jwt and exposes two preHandlers:
 *  - authenticate: verifies the bearer token, rejecting unauthenticated requests.
 *  - requireRole(...roles): authenticate, then reject if the token's role claim isn't allowed.
 *
 * Authentication is applied per-route (via these preHandlers) rather than globally, so the
 * OpenAPI document and the code stay in sync about exactly which endpoints need which role -
 * see each route's `schema.security` declaration.
 */
const authPlugin: FastifyPluginAsync<{ secret: string; expiresIn: string }> = async (
  fastify,
  opts,
) => {
  await fastify.register(jwt, {
    secret: opts.secret,
    sign: { expiresIn: opts.expiresIn },
  });

  fastify.decorate('authenticate', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      await request.jwtVerify();
    } catch {
      await reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: 'A valid bearer token is required to access this resource',
      });
    }
  });

  fastify.decorate('requireRole', (...roles: Role[]) => {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await fastify.authenticate(request, reply);
      if (reply.sent) return;

      if (!roles.includes(request.user.role)) {
        await reply.code(403).send({
          statusCode: 403,
          error: 'Forbidden',
          message: `This action requires one of the following roles: ${roles.join(', ')}`,
        });
      }
    };
  });
};

export default fp(authPlugin, { name: 'auth-plugin' });
