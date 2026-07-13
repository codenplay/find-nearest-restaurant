import { Type, type Static } from '@sinclair/typebox';

export const TokenRequestBody = Type.Object({
  username: Type.String({ minLength: 1 }),
  password: Type.String({ minLength: 1 }),
});
export type TokenRequestBody = Static<typeof TokenRequestBody>;

export const TokenResponse = Type.Object({
  access_token: Type.String(),
  token_type: Type.Literal('Bearer'),
  expires_in: Type.String(),
  role: Type.Union([Type.Literal('admin'), Type.Literal('user')]),
});
export type TokenResponse = Static<typeof TokenResponse>;
