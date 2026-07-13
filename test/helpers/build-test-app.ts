import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import type { FastifyInstance } from 'fastify';

import { buildApp } from '../../src/app.js';
import { loadEnv } from '../../src/config/env.js';

export interface TestApp {
  app: FastifyInstance;
  /** UUIDs this test app's fixtures own. Add to this set for anything else a test creates, so teardown cleans it up too. */
  ownedIds: Set<string>;
  teardown: () => Promise<void>;
}

const FIXTURES = [
  {
    key: 'small',
    name: 'Small Bites',
    x: 1,
    y: 1,
    radius: 1,
    openingHours: '08:00AM-06:00PM',
    image: 'https://example.com/small.png',
  },
  {
    key: 'steakhaus',
    name: 'Deseado Steakhaus',
    x: 2,
    y: 2,
    radius: 2,
    openingHours: '12:00PM-11:00PM',
    image: 'https://example.com/deseado.png',
  },
  {
    key: 'leCinq',
    name: 'Le Cinq',
    x: 5,
    y: 5,
    radius: 1,
    openingHours: '10:00AM-11:00PM',
    image: 'https://example.com/lecinq.png',
  },
  {
    key: 'fireTiger',
    name: 'Fire Tiger',
    x: 2,
    y: 3,
    radius: 5,
    openingHours: '09:00AM-10:00PM',
    image: 'https://example.com/firetiger.png',
  },
] as const;

/**
 * Seeds a handful of known fixtures (matching the spec's worked example) into the real test
 * database, tracked by id, so teardown only ever deletes rows this test app created - never a
 * table-wide wipe. DATABASE_URL may point at a database with other real data (a local dev DB).
 */
export async function buildTestApp(overrides: Record<string, string> = {}): Promise<TestApp> {
  const env = loadEnv({
    ...process.env,
    NODE_ENV: 'test',
    LOG_LEVEL: 'silent',
    JWT_SECRET: 'test-secret-at-least-8-chars',
    DEMO_ADMIN_USERNAME: 'admin',
    DEMO_ADMIN_PASSWORD: 'admin-secret',
    DEMO_USER_USERNAME: 'user',
    DEMO_USER_PASSWORD: 'user-secret',
    WRITE_RATE_LIMIT_MAX: '1000',
    ...overrides,
  });

  const prisma = new PrismaClient();
  const ownedIds = new Set<string>();
  const fixturesWithIds = FIXTURES.map((fixture) => ({ ...fixture, id: randomUUID() }));
  for (const fixture of fixturesWithIds) ownedIds.add(fixture.id);

  await prisma.restaurant.createMany({
    data: fixturesWithIds.map((fixture) => ({
      id: fixture.id,
      name: fixture.name,
      type: 'Restaurant',
      x: fixture.x,
      y: fixture.y,
      radius: fixture.radius,
      openingHours: fixture.openingHours,
      image: fixture.image,
    })),
  });

  const app = await buildApp({ env });

  return {
    app,
    ownedIds,
    teardown: async () => {
      await app.close();
      await prisma.restaurant.deleteMany({ where: { id: { in: Array.from(ownedIds) } } });
      await prisma.$disconnect();
    },
  };
}

export async function getToken(
  app: FastifyInstance,
  username: string,
  password: string,
): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/token',
    payload: { username, password },
  });
  const body = JSON.parse(response.body) as { access_token: string };
  return body.access_token;
}
