import { randomUUID } from 'node:crypto';

import type { PrismaClient } from '@prisma/client';

import type { Restaurant } from '../../types/index.js';
import { dbRowToDomain } from './locations.mapper.js';
import type { LocationsRepositoryPort } from './locations.repository.types.js';

/**
 * Prisma-backed repository - the only runtime datasource for this API (see app.ts). Written
 * entirely against Prisma's query builder (`findMany`/`upsert`/`aggregate`), never raw SQL, so
 * swapping the underlying RDBMS (Postgres -> MySQL/MSSQL/...) only ever touches
 * `prisma/schema.prisma` (`datasource.provider` + any `@db.X` native-type annotations) and a
 * fresh migration for that engine's dialect - this class, LocationsService, the controllers,
 * and the mapper are all unaffected.
 *
 * candidatesNear() bounds its scan to a box sized by the largest radius currently in the
 * dataset, so the `@@index([x, y])` on the `restaurants` table prunes the range scan instead of
 * a full table scan. Plain numeric range predicates (rather than a Postgres-only extension like
 * PostGIS) are the "search algorithm" here deliberately - PostGIS would break the RDBMS-swap
 * promise above. LocationsService still applies the exact distance <= radius check and sort on
 * the resulting superset.
 */
export class PrismaLocationsRepository implements LocationsRepositoryPort {
  /** Restaurants are only ever created/replaced (never deleted) by this API, so this can only grow. */
  private maxRadius = 1;

  private constructor(private readonly prisma: PrismaClient) {}

  static async load(prisma: PrismaClient): Promise<PrismaLocationsRepository> {
    const repository = new PrismaLocationsRepository(prisma);
    const { _max } = await prisma.restaurant.aggregate({ _max: { radius: true } });
    repository.maxRadius = Math.max(1, _max.radius ?? 1);
    return repository;
  }

  async getAll(): Promise<Restaurant[]> {
    const rows = await this.prisma.restaurant.findMany();
    return rows.map(dbRowToDomain);
  }

  async getById(id: string): Promise<Restaurant | undefined> {
    const row = await this.prisma.restaurant.findUnique({ where: { id } });
    return row ? dbRowToDomain(row) : undefined;
  }

  async candidatesNear(x: number, y: number): Promise<Restaurant[]> {
    const rows = await this.prisma.restaurant.findMany({
      where: {
        x: { gte: x - this.maxRadius, lte: x + this.maxRadius },
        y: { gte: y - this.maxRadius, lte: y + this.maxRadius },
      },
    });
    return rows.map(dbRowToDomain);
  }

  async upsert(input: Omit<Restaurant, 'id'> & { id?: string }): Promise<Restaurant> {
    const id = input.id ?? randomUUID();
    const data = {
      name: input.name,
      type: input.type,
      x: input.x,
      y: input.y,
      radius: input.radius,
      openingHours: input.openingHours,
      image: input.image,
    };

    const row = await this.prisma.restaurant.upsert({
      where: { id },
      create: { id, ...data },
      update: data,
    });

    this.maxRadius = Math.max(this.maxRadius, input.radius);
    return dbRowToDomain(row);
  }
}
