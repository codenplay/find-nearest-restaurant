import type {
  RestaurantDetailResponse,
  RestaurantIdParam,
  RestaurantWriteResponse,
  SearchQuery,
  SearchResponse,
  UpsertRestaurantBody,
} from './locations.schema.js';
import type { LocationsService } from './locations.service.js';

/**
 * Framework-agnostic request handling: plain validated data in, plain response data out - no
 * Fastify types here at all, so this is unit-testable without mocking a request/reply. The
 * thin Fastify-specific adapter (extracting request.query/params/body, setting the status
 * code) lives in locations.routes.ts.
 */
export interface LocationsController {
  search(query: SearchQuery): Promise<SearchResponse>;
  getById(params: RestaurantIdParam): Promise<RestaurantDetailResponse>;
  upsert(
    params: RestaurantIdParam,
    body: UpsertRestaurantBody,
  ): Promise<{ restaurant: RestaurantWriteResponse; created: boolean }>;
}

export function makeLocationsController(locationsService: LocationsService): LocationsController {
  return {
    async search(query) {
      return locationsService.searchVisibleFrom(query.x, query.y);
    },

    async getById(params) {
      return locationsService.getById(params.id);
    },

    async upsert(params, body) {
      return locationsService.upsert(params.id, body);
    },
  };
}
