import type { FastifyPluginAsync } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

import { makeAuthController } from './auth.controller.js';
import { TokenRequestBody, TokenResponse } from './auth.schema.js';
import type { AuthService } from './auth.service.js';
import { ErrorResponse } from '../locations/locations.schema.js';

export interface AuthRoutesOptions {
  authService: AuthService;
  jwtExpiresIn: string;
}

const authRoutes: FastifyPluginAsync<AuthRoutesOptions> = async (
  fastify,
  { authService, jwtExpiresIn },
) => {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();
  const controller = makeAuthController(authService, jwtExpiresIn);

  app.post(
    '/token',
    {
      schema: {
        tags: ['auth'],
        summary: 'Issue a JWT bearer token carrying a role claim',
        body: TokenRequestBody,
        response: {
          200: TokenResponse,
          401: ErrorResponse,
        },
      },
      config: {
        rateLimit: { max: 10, timeWindow: '1 minute' },
      },
    },
    async (request, reply) =>
      controller.issueToken(request.body, (payload) => reply.jwtSign(payload)),
  );
};

export default authRoutes;
