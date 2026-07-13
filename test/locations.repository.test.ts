import { randomUUID } from 'node:crypto';

import { PrismaClient } from '@prisma/client';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { PrismaLocationsRepository } from '../src/modules/locations/locations.repository.js';

/**
 * Exercises PrismaLocationsRepository - the sole runtime repository - against a real database,
 * so it only runs when DATABASE_URL is set - see README "Database" section for how to start
 * one locally (`docker compose up -d db && npm run db:migrate`). CI provides a Postgres service
 * container so this suite always runs there even when skipped locally.
 *
 * Cleanup only ever touches rows whose id this suite generated (tracked in `ownedIds`) - never
 * a table-wide deleteMany(). DATABASE_URL may point at a database with real seeded data (e.g. a
 * local dev DB), and this suite must not be destructive to it.
 */
describe.skipIf(!process.env.DATABASE_URL)('PrismaLocationsRepository', () => {
  const prisma = new PrismaClient();

  const ids = {
    small: randomUUID(),
    steakhaus: randomUUID(),
    leCinq: randomUUID(),
    fireTiger: randomUUID(),
  };
  const ownedIds = new Set<string>(Object.values(ids));

  beforeEach(async () => {
    // Clears only this suite's own rows (base fixtures + anything an earlier test created),
    // then re-seeds the base fixtures fresh for the next test.
    await prisma.restaurant.deleteMany({ where: { id: { in: Array.from(ownedIds) } } });
    await prisma.restaurant.createMany({
      data: [
        {
          id: ids.small,
          name: 'Small Bites',
          type: 'Restaurant',
          x: 1,
          y: 1,
          radius: 1,
          openingHours: '08:00AM-06:00PM',
          image: 'https://example.com/small.png',
        },
        {
          id: ids.steakhaus,
          name: 'Deseado Steakhaus',
          type: 'Restaurant',
          x: 2,
          y: 2,
          radius: 2,
          openingHours: '12:00PM-11:00PM',
          image: 'https://example.com/deseado.png',
        },
        {
          id: ids.leCinq,
          name: 'Le Cinq',
          type: 'Restaurant',
          x: 5,
          y: 5,
          radius: 1,
          openingHours: '10:00AM-11:00PM',
          image: 'https://example.com/lecinq.png',
        },
        {
          id: ids.fireTiger,
          name: 'Fire Tiger',
          type: 'Restaurant',
          x: 2,
          y: 3,
          radius: 5,
          openingHours: '09:00AM-10:00PM',
          image: 'https://example.com/firetiger.png',
        },
      ],
    });
  });

  afterAll(async () => {
    await prisma.restaurant.deleteMany({ where: { id: { in: Array.from(ownedIds) } } });
    await prisma.$disconnect();
  });

  it('loads getAll/getById from Postgres', async () => {
    const repository = await PrismaLocationsRepository.load(prisma);

    const all = await repository.getAll();
    const owned = all.filter((r) => ownedIds.has(r.id));
    expect(owned).toHaveLength(4);
    expect(await repository.getById(ids.fireTiger)).toMatchObject({
      name: 'Fire Tiger',
      x: 2,
      y: 3,
      radius: 5,
    });
    expect(await repository.getById(randomUUID())).toBeUndefined();
  });

  it('candidatesNear returns a superset that includes every restaurant covering the point', async () => {
    const repository = await PrismaLocationsRepository.load(prisma);

    const candidateIds = (await repository.candidatesNear(3, 2)).map((r) => r.id);
    // True positives (matches the worked example from the spec): Deseado Steakhaus, Fire Tiger.
    expect(candidateIds).toEqual(expect.arrayContaining([ids.steakhaus, ids.fireTiger]));
  });

  it('does not miss a restaurant far from the origin once maxRadius accounts for it', async () => {
    const repository = await PrismaLocationsRepository.load(prisma);
    const farId = randomUUID();
    ownedIds.add(farId);

    await repository.upsert({
      id: farId,
      name: 'Far Away',
      type: 'Restaurant',
      x: 100_000,
      y: 100_000,
      radius: 25,
      openingHours: '09:00AM-09:00PM',
      image: 'https://example.com/far.png',
    });

    const candidateIds = (await repository.candidatesNear(100_010, 100_000)).map((r) => r.id);
    expect(candidateIds).toContain(farId);
  });

  it('persists and round-trips decimal (float) coordinates', async () => {
    const repository = await PrismaLocationsRepository.load(prisma);
    const floatId = randomUUID();
    ownedIds.add(floatId);

    await repository.upsert({
      id: floatId,
      name: 'Float Spot',
      type: 'Restaurant',
      x: 12.5,
      y: 7.25,
      radius: 1,
      openingHours: '24 hours',
      image: 'https://example.com/float.png',
    });

    expect(await repository.getById(floatId)).toMatchObject({ x: 12.5, y: 7.25 });
  });

  it('upsert creates a new row and replaces an existing one', async () => {
    const repository = await PrismaLocationsRepository.load(prisma);

    const createdId = randomUUID();
    ownedIds.add(createdId);
    const created = await repository.upsert({
      id: createdId,
      name: 'New Place',
      type: 'Restaurant',
      x: 10,
      y: 20,
      radius: 2,
      openingHours: '10:00AM-10:00PM',
      image: 'https://example.com/new.png',
    });
    expect(created.id).toBe(createdId);
    expect(await repository.getById(createdId)).toMatchObject({ x: 10, y: 20 });

    const replaced = await repository.upsert({
      id: ids.leCinq,
      name: 'Le Cinq Renamed',
      type: 'Restaurant',
      x: 5,
      y: 5,
      radius: 3,
      openingHours: '10:00AM-11:00PM',
      image: 'https://example.com/lecinq.png',
    });
    expect(replaced.name).toBe('Le Cinq Renamed');
    expect(replaced.radius).toBe(3);

    const all = await repository.getAll();
    const owned = all.filter((r) => ownedIds.has(r.id));
    expect(owned).toHaveLength(5);
  });
});
