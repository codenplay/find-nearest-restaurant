import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';

import type { LocationsRepositoryPort } from '../src/modules/locations/locations.repository.types.js';
import {
  LocationsService,
  RestaurantIdMismatchError,
  RestaurantNotFoundError,
} from '../src/modules/locations/locations.service.js';
import type { Restaurant } from '../src/types/index.js';

/**
 * In-memory test double for LocationsRepositoryPort, so LocationsService's business logic
 * (distance filtering, sorting, not-found/id-mismatch errors) can be unit-tested with no
 * database at all. This is a test double, not a second runtime datasource - production always
 * builds PrismaLocationsRepository (see app.ts); PostgreSQL is the only runtime datasource.
 */
class FakeLocationsRepository implements LocationsRepositoryPort {
  private byId: Map<string, Restaurant>;

  constructor(seed: Restaurant[]) {
    this.byId = new Map(seed.map((restaurant) => [restaurant.id, restaurant]));
  }

  async getAll(): Promise<Restaurant[]> {
    return Array.from(this.byId.values());
  }

  async getById(id: string): Promise<Restaurant | undefined> {
    return this.byId.get(id);
  }

  // No spatial pruning needed for a handful of fixtures - returning everything and letting
  // LocationsService apply the exact distance <= radius filter is a valid superset, same
  // contract every LocationsRepositoryPort implementation must satisfy.
  async candidatesNear(): Promise<Restaurant[]> {
    return this.getAll();
  }

  async upsert(input: Omit<Restaurant, 'id'> & { id?: string }): Promise<Restaurant> {
    const restaurant: Restaurant = { ...input, id: input.id ?? randomUUID() };
    this.byId.set(restaurant.id, restaurant);
    return restaurant;
  }
}

describe('LocationsService', () => {
  const ids = {
    small: randomUUID(),
    steakhaus: randomUUID(),
    leCinq: randomUUID(),
    fireTiger: randomUUID(),
  };

  function makeService(): LocationsService {
    const repository = new FakeLocationsRepository([
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
    ]);
    return new LocationsService(repository);
  }

  it('returns only restaurants whose circle covers the user, sorted by distance ascending', async () => {
    const result = await makeService().searchVisibleFrom(3, 2);

    expect(result['user-location']).toBe('x=3,y=2');
    expect(result.locations.map((l) => l.name)).toEqual(['Deseado Steakhaus', 'Fire Tiger']);
    expect(result.locations[0]?.distance).toBe(1);
    expect(result.locations[1]?.distance).toBe(1.41421);
    expect(result).not.toHaveProperty('message');
  });

  it('returns an empty list with a meaningful message when nothing covers the user', async () => {
    const result = await makeService().searchVisibleFrom(1000, 1000);
    expect(result.locations).toEqual([]);
    expect(result.message).toBe('No restaurants found near this location.');
  });

  it('returns restaurant details by id, without exposing radius', async () => {
    const detail = await makeService().getById(ids.fireTiger);
    expect(detail).toEqual({
      id: ids.fireTiger,
      name: 'Fire Tiger',
      type: 'Restaurant',
      coordinates: 'x=2,y=3',
      'opening-hours': '09:00AM-10:00PM',
      image: 'https://example.com/firetiger.png',
    });
  });

  it('throws RestaurantNotFoundError for an unknown id', async () => {
    await expect(makeService().getById(randomUUID())).rejects.toThrow(RestaurantNotFoundError);
  });

  it('creates a new restaurant via upsert and reports created=true', async () => {
    const service = makeService();
    const newId = randomUUID();
    const { restaurant, created } = await service.upsert(newId, {
      id: newId,
      name: 'Da Jia Le',
      type: 'Restaurant',
      'opening-hours': '10:00AM-11:00PM',
      image: 'https://tinyurl.com',
      coordinates: 'x=8,y=8',
      radius: 1,
    });

    expect(created).toBe(true);
    expect(restaurant).toMatchObject({ id: newId, name: 'Da Jia Le', coordinates: 'x=8,y=8' });
    expect(await service.getById(newId)).toBeDefined();
  });

  it('supports decimal (float) coordinates end to end', async () => {
    const service = makeService();
    const newId = randomUUID();
    const { restaurant } = await service.upsert(newId, {
      id: newId,
      name: 'Float Spot',
      type: 'Restaurant',
      'opening-hours': '24 hours',
      image: 'https://tinyurl.com',
      coordinates: 'x=12.5,y=7.25',
      radius: 1,
    });

    expect(restaurant.coordinates).toBe('x=12.5,y=7.25');

    const searchResult = await service.searchVisibleFrom(12.5, 8);
    expect(searchResult.locations.map((l) => l.id)).toContain(newId);
    expect(searchResult.locations.find((l) => l.id === newId)?.distance).toBe(0.75);
  });

  it('replaces an existing restaurant via upsert and reports created=false', async () => {
    const service = makeService();
    const { restaurant, created } = await service.upsert(ids.leCinq, {
      name: 'Le Cinq Renamed',
      type: 'Restaurant',
      'opening-hours': '10:00AM-11:00PM',
      image: 'https://example.com/lecinq.png',
      coordinates: 'x=5,y=5',
      radius: 2,
    });

    expect(created).toBe(false);
    expect(restaurant.name).toBe('Le Cinq Renamed');
    expect(restaurant.radius).toBe(2);
  });

  it('rejects upsert when body id does not match the path id', async () => {
    const service = makeService();
    await expect(
      service.upsert(ids.leCinq, {
        id: randomUUID(),
        name: 'Mismatch',
        type: 'Restaurant',
        'opening-hours': '10:00AM-11:00PM',
        image: 'https://example.com/img.png',
        coordinates: 'x=5,y=5',
        radius: 1,
      }),
    ).rejects.toThrow(RestaurantIdMismatchError);
  });
});
