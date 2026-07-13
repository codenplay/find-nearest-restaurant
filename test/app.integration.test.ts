import { randomUUID } from 'node:crypto';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildTestApp, getToken, type TestApp } from './helpers/build-test-app.js';

interface SearchItem {
  id: string;
  name: string;
  coordinates: string;
  distance: number;
}

/** Search results may include unrelated real data already in a shared dev database - filter to this test's own fixtures before asserting exact contents/order. */
function ownedOnly(locations: SearchItem[], ownedIds: Set<string>): SearchItem[] {
  return locations.filter((l) => ownedIds.has(l.id));
}

/**
 * Full HTTP integration suite, run via Fastify's inject() against a real Postgres (PostgreSQL
 * is the only runtime datasource - see app.ts). Skipped locally unless DATABASE_URL is set
 * (`docker compose up -d db && npm run db:migrate`); CI always provides a Postgres service
 * container, so this suite always runs there.
 */
describe.skipIf(!process.env.DATABASE_URL)('API integration', () => {
  let ctx: TestApp;

  beforeEach(async () => {
    ctx = await buildTestApp();
  });

  afterEach(async () => {
    await ctx.teardown();
  });

  describe('POST /auth/token', () => {
    it('issues a bearer token with a role claim for valid credentials', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { username: 'admin', password: 'admin-secret' },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.role).toBe('admin');
      expect(body.token_type).toBe('Bearer');
      expect(typeof body.access_token).toBe('string');
    });

    it('rejects invalid credentials with 401', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { username: 'admin', password: 'wrong' },
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejects a malformed body with 400', async () => {
      const response = await ctx.app.inject({
        method: 'POST',
        url: '/auth/token',
        payload: { username: 'admin' },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('GET /locations/search', () => {
    it('rejects unauthenticated requests with 401', async () => {
      const response = await ctx.app.inject({ method: 'GET', url: '/locations/search?x=3&y=2' });
      expect(response.statusCode).toBe(401);
    });

    it('returns visible restaurants sorted by distance for an authenticated user', async () => {
      const token = await getToken(ctx.app, 'user', 'user-secret');

      const response = await ctx.app.inject({
        method: 'GET',
        url: '/locations/search?x=3&y=2',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body['user-location']).toBe('x=3,y=2');
      // Filtered to this test's own fixtures - a shared dev database may have other real data
      // nearby too; the ordering/distance guarantee only needs to hold among what we own.
      const owned = ownedOnly(body.locations, ctx.ownedIds);
      expect(owned.map((l) => l.name)).toEqual(['Deseado Steakhaus', 'Fire Tiger']);
      expect(owned[0]?.distance).toBe(1);
      expect(owned[1]?.distance).toBe(1.41421);
      expect(body).not.toHaveProperty('message');
    });

    it('accepts decimal (float) coordinates in the query', async () => {
      const token = await getToken(ctx.app, 'user', 'user-secret');

      const response = await ctx.app.inject({
        method: 'GET',
        url: '/locations/search?x=2.5&y=2',
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json()['user-location']).toBe('x=2.5,y=2');
    });

    // The "empty results include a meaningful message" behavior is covered deterministically in
    // locations.service.test.ts (an in-memory fake with full control over the dataset). It's not
    // repeated here: this suite runs against a real, shared database that can legitimately hold
    // restaurants anywhere in the coordinate space (that's the point of the app), so no fixed
    // query point here is a permanently reliable guarantee of emptiness to assert against.

    it('rejects negative coordinates with 400', async () => {
      const token = await getToken(ctx.app, 'user', 'user-secret');

      const badX = await ctx.app.inject({
        method: 'GET',
        url: '/locations/search?x=-1&y=2',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(badX.statusCode).toBe(400);
    });
  });

  describe('GET /locations/:id', () => {
    it('returns 401 when unauthenticated', async () => {
      const response = await ctx.app.inject({
        method: 'GET',
        url: `/locations/${randomUUID()}`,
      });
      expect(response.statusCode).toBe(401);
    });

    it('returns 404 for an unknown id', async () => {
      const token = await getToken(ctx.app, 'user', 'user-secret');
      const response = await ctx.app.inject({
        method: 'GET',
        url: `/locations/${randomUUID()}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(response.statusCode).toBe(404);
    });

    it('returns restaurant details for a known id', async () => {
      const token = await getToken(ctx.app, 'user', 'user-secret');
      const searchResponse = await ctx.app.inject({
        method: 'GET',
        url: '/locations/search?x=3&y=2',
        headers: { authorization: `Bearer ${token}` },
      });
      const id = ownedOnly(searchResponse.json().locations, ctx.ownedIds)[0]?.id;

      const response = await ctx.app.inject({
        method: 'GET',
        url: `/locations/${id}`,
        headers: { authorization: `Bearer ${token}` },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toMatchObject({ id, name: 'Deseado Steakhaus' });
      expect(body).not.toHaveProperty('radius');
    });
  });

  describe('PUT /locations/:id', () => {
    const newRestaurant = (id: string) => ({
      id,
      name: 'Da Jia Le',
      type: 'Restaurant',
      'opening-hours': '10:00AM-11:00PM',
      image: 'https://tinyurl.com',
      coordinates: 'x=9,y=9',
      radius: 1,
    });

    it('rejects unauthenticated requests with 401', async () => {
      const id = randomUUID();
      const response = await ctx.app.inject({
        method: 'PUT',
        url: `/locations/${id}`,
        payload: newRestaurant(id),
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejects non-admin users with 403', async () => {
      const token = await getToken(ctx.app, 'user', 'user-secret');
      const id = randomUUID();
      const response = await ctx.app.inject({
        method: 'PUT',
        url: `/locations/${id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: newRestaurant(id),
      });
      expect(response.statusCode).toBe(403);
    });

    it('allows an admin to create a new restaurant, returning 201', async () => {
      const token = await getToken(ctx.app, 'admin', 'admin-secret');
      const id = randomUUID();
      ctx.ownedIds.add(id);

      const response = await ctx.app.inject({
        method: 'PUT',
        url: `/locations/${id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: newRestaurant(id),
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ id, name: 'Da Jia Le', coordinates: 'x=9,y=9' });

      const getResponse = await ctx.app.inject({
        method: 'GET',
        url: `/locations/${id}`,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(getResponse.statusCode).toBe(200);
    });

    it('accepts decimal (float) coordinates', async () => {
      const token = await getToken(ctx.app, 'admin', 'admin-secret');
      const id = randomUUID();
      ctx.ownedIds.add(id);

      const response = await ctx.app.inject({
        method: 'PUT',
        url: `/locations/${id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { ...newRestaurant(id), coordinates: 'x=12.5,y=7.25' },
      });

      expect(response.statusCode).toBe(201);
      expect(response.json().coordinates).toBe('x=12.5,y=7.25');
    });

    it('allows an admin to replace an existing restaurant, returning 200', async () => {
      const token = await getToken(ctx.app, 'admin', 'admin-secret');
      const id = randomUUID();
      ctx.ownedIds.add(id);

      await ctx.app.inject({
        method: 'PUT',
        url: `/locations/${id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: newRestaurant(id),
      });

      const response = await ctx.app.inject({
        method: 'PUT',
        url: `/locations/${id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { ...newRestaurant(id), name: 'Da Jia Le Updated' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe('Da Jia Le Updated');
    });

    it('rejects a body/path id mismatch with 400', async () => {
      const token = await getToken(ctx.app, 'admin', 'admin-secret');
      const id = randomUUID();
      const response = await ctx.app.inject({
        method: 'PUT',
        url: `/locations/${id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: newRestaurant(randomUUID()),
      });
      expect(response.statusCode).toBe(400);
    });

    it('rejects an invalid body with 400', async () => {
      const token = await getToken(ctx.app, 'admin', 'admin-secret');
      const id = randomUUID();
      const response = await ctx.app.inject({
        method: 'PUT',
        url: `/locations/${id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: { ...newRestaurant(id), radius: -1 },
      });
      expect(response.statusCode).toBe(400);
    });
  });

  describe('rate limiting', () => {
    it('returns 429 once the write rate limit is exceeded', async () => {
      const limited = await buildTestApp({ WRITE_RATE_LIMIT_MAX: '2' });
      const buildPayload = (id: string) => ({
        id,
        name: 'Rate Limited Place',
        type: 'Restaurant',
        'opening-hours': '10:00AM-11:00PM',
        image: 'https://tinyurl.com',
        coordinates: 'x=1,y=1',
        radius: 1,
      });

      try {
        const token = await getToken(limited.app, 'admin', 'admin-secret');
        const attempt = () => {
          const id = randomUUID();
          limited.ownedIds.add(id);
          return limited.app.inject({
            method: 'PUT',
            url: `/locations/${id}`,
            headers: { authorization: `Bearer ${token}` },
            payload: buildPayload(id),
          });
        };

        await attempt();
        await attempt();
        const third = await attempt();

        expect(third.statusCode).toBe(429);
      } finally {
        await limited.teardown();
      }
    });
  });

  describe('OpenAPI documentation', () => {
    it('serves the generated OpenAPI document', async () => {
      const response = await ctx.app.inject({ method: 'GET', url: '/docs/json' });
      expect(response.statusCode).toBe(200);
      const doc = response.json();
      expect(doc.paths['/locations/search']).toBeDefined();
      expect(doc.paths['/locations/{id}']).toBeDefined();
      expect(doc.paths['/auth/token']).toBeDefined();
    });
  });

  describe('GET /health', () => {
    it('is reachable without authentication and confirms database connectivity', async () => {
      const response = await ctx.app.inject({ method: 'GET', url: '/health' });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok' });
    });
  });

  describe('unknown routes', () => {
    it('returns a structured 404 for a route that does not exist', async () => {
      const response = await ctx.app.inject({ method: 'GET', url: '/does-not-exist' });
      expect(response.statusCode).toBe(404);
      expect(response.json()).toMatchObject({
        statusCode: 404,
        error: 'Not Found',
      });
    });
  });
});
