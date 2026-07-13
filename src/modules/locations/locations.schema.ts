import { Type, type Static } from '@sinclair/typebox';

export const RestaurantIdParam = Type.Object({
  id: Type.String({ format: 'uuid', description: 'Restaurant UUID' }),
});
export type RestaurantIdParam = Static<typeof RestaurantIdParam>;

export const SearchQuery = Type.Object({
  x: Type.Number({ minimum: 0, description: 'User X coordinate' }),
  y: Type.Number({ minimum: 0, description: 'User Y coordinate' }),
});
export type SearchQuery = Static<typeof SearchQuery>;

export const RestaurantSearchItem = Type.Object({
  id: Type.String({ format: 'uuid' }),
  name: Type.String(),
  coordinates: Type.String({ description: 'Formatted as x=<number>,y=<number>' }),
  distance: Type.Number({ description: 'Euclidean distance from the user, rounded to 5 decimals' }),
});
export type RestaurantSearchItem = Static<typeof RestaurantSearchItem>;

export const SearchResponse = Type.Object({
  'user-location': Type.String({ description: 'Formatted as x=<number>,y=<number>' }),
  locations: Type.Array(RestaurantSearchItem),
  message: Type.Optional(
    Type.String({ description: 'Present with a human-readable note when locations is empty' }),
  ),
});
export type SearchResponse = Static<typeof SearchResponse>;

/** GET /locations/:id response - matches the spec exactly, radius is not part of this view. */
export const RestaurantDetailResponse = Type.Object({
  name: Type.String(),
  type: Type.String(),
  id: Type.String({ format: 'uuid' }),
  'opening-hours': Type.String(),
  image: Type.String(),
  coordinates: Type.String({ description: 'Formatted as x=<number>,y=<number>' }),
});
export type RestaurantDetailResponse = Static<typeof RestaurantDetailResponse>;

/** PUT /locations/:id response - echoes the full written record, including radius. */
export const RestaurantWriteResponse = Type.Object({
  ...RestaurantDetailResponse.properties,
  radius: Type.Integer({ minimum: 1 }),
});
export type RestaurantWriteResponse = Static<typeof RestaurantWriteResponse>;

export const UpsertRestaurantBody = Type.Object({
  id: Type.Optional(
    Type.String({ format: 'uuid', description: 'Must match the :id path parameter if provided' }),
  ),
  name: Type.String({ minLength: 1 }),
  type: Type.String({ minLength: 1 }),
  'opening-hours': Type.String({ minLength: 1 }),
  image: Type.String({ format: 'uri' }),
  coordinates: Type.String({
    pattern: '^x=\\d+(?:\\.\\d+)?,y=\\d+(?:\\.\\d+)?$',
    description: 'Formatted as x=<non-negative number>,y=<non-negative number>',
  }),
  radius: Type.Integer({ minimum: 1 }),
});
export type UpsertRestaurantBody = Static<typeof UpsertRestaurantBody>;

export const ErrorResponse = Type.Object({
  statusCode: Type.Integer(),
  error: Type.String(),
  message: Type.String(),
});
