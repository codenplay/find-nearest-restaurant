import { formatCoordinates, parseCoordinates } from '../../utils/coordinates.js';
import { euclideanDistance, roundDistance } from '../../utils/distance.js';
import {
  domainToDetailResponse,
  domainToSearchItem,
  domainToWriteResponse,
} from './locations.mapper.js';
import type { LocationsRepositoryPort } from './locations.repository.types.js';
import type {
  RestaurantDetailResponse,
  RestaurantWriteResponse,
  SearchResponse,
  UpsertRestaurantBody,
} from './locations.schema.js';

export class RestaurantNotFoundError extends Error {
  constructor(id: string) {
    super(`Restaurant with id "${id}" was not found`);
  }
}

export class RestaurantIdMismatchError extends Error {
  constructor(pathId: string, bodyId: string) {
    super(`Path id "${pathId}" does not match body id "${bodyId}"`);
  }
}

const NO_RESULTS_MESSAGE = 'No restaurants found near this location.';

export class LocationsService {
  constructor(private readonly repository: LocationsRepositoryPort) {}

  async searchVisibleFrom(x: number, y: number): Promise<SearchResponse> {
    const candidates = await this.repository.candidatesNear(x, y);

    const visible = candidates
      .map((restaurant) => ({
        restaurant,
        distance: euclideanDistance(x, y, restaurant.x, restaurant.y),
      }))
      .filter(({ restaurant, distance }) => distance <= restaurant.radius)
      .sort((a, b) => a.distance - b.distance);

    const locations = visible.map(({ restaurant, distance }) =>
      domainToSearchItem(restaurant, roundDistance(distance)),
    );

    return {
      'user-location': formatCoordinates(x, y),
      locations,
      ...(locations.length === 0 ? { message: NO_RESULTS_MESSAGE } : {}),
    };
  }

  async getById(id: string): Promise<RestaurantDetailResponse> {
    const restaurant = await this.repository.getById(id);
    if (!restaurant) {
      throw new RestaurantNotFoundError(id);
    }
    return domainToDetailResponse(restaurant);
  }

  async upsert(
    pathId: string,
    body: UpsertRestaurantBody,
  ): Promise<{ restaurant: RestaurantWriteResponse; created: boolean }> {
    if (body.id !== undefined && body.id !== pathId) {
      throw new RestaurantIdMismatchError(pathId, body.id);
    }

    const created = (await this.repository.getById(pathId)) === undefined;
    const { x, y } = parseCoordinates(body.coordinates);

    const restaurant = await this.repository.upsert({
      id: pathId,
      name: body.name,
      type: body.type,
      x,
      y,
      radius: body.radius,
      openingHours: body['opening-hours'],
      image: body.image,
    });

    return { restaurant: domainToWriteResponse(restaurant), created };
  }
}
