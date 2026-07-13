import type { Restaurant as PrismaRestaurant } from '@prisma/client';

import type { Restaurant } from '../../types/index.js';
import { formatCoordinates, parseCoordinates } from '../../utils/coordinates.js';
import type {
  RestaurantDetailResponse,
  RestaurantSearchItem,
  RestaurantWriteResponse,
} from './locations.schema.js';

/** Shape of a single restaurant record as it appears in a seed JSON file's `locations` array. */
export interface RestaurantFileRecord {
  id: string;
  name: string;
  type: string;
  'opening-hours': string;
  image: string;
  coordinates: string;
  radius: number;
}

/** Used only by prisma/seed.ts - the JSON file format is a seed/import input, never a runtime datasource. */
export function fileRecordToDomain(record: RestaurantFileRecord): Restaurant {
  const { x, y } = parseCoordinates(record.coordinates);
  return {
    id: record.id,
    name: record.name,
    type: record.type,
    x,
    y,
    radius: record.radius,
    openingHours: record['opening-hours'],
    image: record.image,
  };
}

/** Prisma row -> domain, used by PrismaLocationsRepository (the sole runtime repository). */
export function dbRowToDomain(row: PrismaRestaurant): Restaurant {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    x: row.x,
    y: row.y,
    radius: row.radius,
    openingHours: row.openingHours,
    image: row.image,
  };
}

/** GET /locations/:id response shape - no radius, matches the spec exactly. */
export function domainToDetailResponse(restaurant: Restaurant): RestaurantDetailResponse {
  return {
    name: restaurant.name,
    type: restaurant.type,
    id: restaurant.id,
    'opening-hours': restaurant.openingHours,
    image: restaurant.image,
    coordinates: formatCoordinates(restaurant.x, restaurant.y),
  };
}

/** PUT /locations/:id response shape - echoes the full written record, including radius. */
export function domainToWriteResponse(restaurant: Restaurant): RestaurantWriteResponse {
  return { ...domainToDetailResponse(restaurant), radius: restaurant.radius };
}

/** GET /locations/search item shape - id/name/coordinates plus the caller-computed distance. */
export function domainToSearchItem(restaurant: Restaurant, distance: number): RestaurantSearchItem {
  return {
    id: restaurant.id,
    name: restaurant.name,
    coordinates: formatCoordinates(restaurant.x, restaurant.y),
    distance,
  };
}
