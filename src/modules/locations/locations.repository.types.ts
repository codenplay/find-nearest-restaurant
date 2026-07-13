import type { Restaurant } from '../../types/index.js';

/**
 * Storage-agnostic contract LocationsService depends on. The only production implementation
 * is PrismaLocationsRepository (locations.repository.ts) - PostgreSQL is the sole runtime
 * datasource. The port still earns its keep even with one adapter: it's what lets
 * LocationsService be unit-tested with an in-memory fake (see test/locations.service.test.ts)
 * and what keeps a future RDBMS swap or ORM change from rippling into the service/controller
 * layers.
 */
export interface LocationsRepositoryPort {
  getAll(): Promise<Restaurant[]>;
  getById(id: string): Promise<Restaurant | undefined>;
  /** Restaurants that could possibly cover (x, y); callers still apply the exact distance <= radius check. */
  candidatesNear(x: number, y: number): Promise<Restaurant[]>;
  /** Creates or replaces the restaurant with input.id (or a fresh UUID if omitted). */
  upsert(input: Omit<Restaurant, 'id'> & { id?: string }): Promise<Restaurant>;
}
