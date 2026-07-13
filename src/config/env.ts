import { Type, type Static } from '@sinclair/typebox';
import { Value } from '@sinclair/typebox/value';

const EnvSchema = Type.Object({
  HOST: Type.String({ default: '0.0.0.0' }),
  PORT: Type.Number({ default: 3000 }),
  LOG_LEVEL: Type.Union(
    [
      Type.Literal('fatal'),
      Type.Literal('error'),
      Type.Literal('warn'),
      Type.Literal('info'),
      Type.Literal('debug'),
      Type.Literal('trace'),
      Type.Literal('silent'),
    ],
    { default: 'info' },
  ),
  NODE_ENV: Type.Union(
    [Type.Literal('development'), Type.Literal('production'), Type.Literal('test')],
    {
      default: 'development',
    },
  ),

  /** PostgreSQL connection string - the only runtime datasource (see PrismaLocationsRepository). */
  DATABASE_URL: Type.String({ minLength: 1 }),

  JWT_SECRET: Type.String({ minLength: 8 }),
  JWT_EXPIRES_IN: Type.String({ default: '1h' }),

  DEMO_ADMIN_USERNAME: Type.String({ default: 'admin' }),
  DEMO_ADMIN_PASSWORD: Type.String({ default: 'admin-secret' }),
  DEMO_USER_USERNAME: Type.String({ default: 'user' }),
  DEMO_USER_PASSWORD: Type.String({ default: 'user-secret' }),

  WRITE_RATE_LIMIT_MAX: Type.Number({ default: 20 }),
  WRITE_RATE_LIMIT_WINDOW: Type.String({ default: '1 minute' }),
});

export type Env = Static<typeof EnvSchema>;

function coerce(raw: NodeJS.ProcessEnv): Record<string, unknown> {
  return {
    ...raw,
    PORT: raw.PORT !== undefined ? Number(raw.PORT) : undefined,
    WRITE_RATE_LIMIT_MAX:
      raw.WRITE_RATE_LIMIT_MAX !== undefined ? Number(raw.WRITE_RATE_LIMIT_MAX) : undefined,
  };
}

export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const candidate = coerce(raw);
  const withDefaults = Value.Default(EnvSchema, candidate) as Record<string, unknown>;
  const errors = [...Value.Errors(EnvSchema, withDefaults)];

  if (errors.length > 0) {
    const details = errors.map((e) => `  - ${e.path || '(root)'}: ${e.message}`).join('\n');
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return Value.Cast(EnvSchema, withDefaults);
}
