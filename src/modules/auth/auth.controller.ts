import type { TokenRequestBody, TokenResponse } from './auth.schema.js';
import type { AuthService } from './auth.service.js';
import type { Role } from '../../types/index.js';

/** Narrow shape of the bit of Fastify (reply.jwtSign) this controller actually needs. */
export type SignToken = (payload: { username: string; role: Role }) => Promise<string>;

/** Framework-agnostic: plain validated data in, plain response data out - see locations.controller.ts. */
export interface AuthController {
  issueToken(body: TokenRequestBody, signToken: SignToken): Promise<TokenResponse>;
}

export function makeAuthController(authService: AuthService, jwtExpiresIn: string): AuthController {
  return {
    async issueToken(body, signToken) {
      const { username, password } = body;
      const role = authService.authenticate(username, password);
      const token = await signToken({ username, role });

      return {
        access_token: token,
        token_type: 'Bearer',
        expires_in: jwtExpiresIn,
        role,
      };
    },
  };
}
