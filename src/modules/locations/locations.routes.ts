import type { FastifyPluginAsync } from 'fastify';
import type { TypeBoxTypeProvider } from '@fastify/type-provider-typebox';

import { makeLocationsController } from './locations.controller.js';
import {
  ErrorResponse,
  RestaurantDetailResponse,
  RestaurantIdParam,
  RestaurantWriteResponse,
  SearchQuery,
  SearchResponse,
  UpsertRestaurantBody,
} from './locations.schema.js';
import type { LocationsService } from './locations.service.js';

export interface LocationsRoutesOptions {
  locationsService: LocationsService;
  writeRateLimit: { max: number; timeWindow: string };
}

const locationsRoutes: FastifyPluginAsync<LocationsRoutesOptions> = async (
  fastify,
  { locationsService, writeRateLimit },
) => {
  const app = fastify.withTypeProvider<TypeBoxTypeProvider>();
  const controller = makeLocationsController(locationsService);

  app.get(
    '/search',
    {
      onRequest: fastify.requireRole('admin', 'user'),
      schema: {
        tags: ['locations'],
        summary: 'Find restaurants visible from the given user coordinates',
        security: [{ bearerAuth: [] }],
        querystring: SearchQuery,
        response: {
          200: SearchResponse,
          400: ErrorResponse,
          401: ErrorResponse,
        },
      },
    },
    async (request) => controller.search(request.query),
  );

  app.get(
    '/:id',
    {
      onRequest: fastify.requireRole('admin', 'user'),
      schema: {
        tags: ['locations'],
        summary: 'Get detailed information about a restaurant',
        security: [{ bearerAuth: [] }],
        params: RestaurantIdParam,
        response: {
          200: RestaurantDetailResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
      },
    },
    async (request) => controller.getById(request.params),
  );

  app.put(
    '/:id',
    {
      onRequest: fastify.requireRole('admin'),
      config: {
        rateLimit: writeRateLimit,
      },
      schema: {
        tags: ['locations'],
        summary: 'Create or replace a restaurant (admin only)',
        security: [{ bearerAuth: [] }],
        params: RestaurantIdParam,
        body: UpsertRestaurantBody,
        response: {
          200: RestaurantWriteResponse,
          201: RestaurantWriteResponse,
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          429: ErrorResponse,
        },
      },
    },
    async (request, reply) => {
      const { restaurant, created } = await controller.upsert(request.params, request.body);
      reply.code(created ? 201 : 200);
      return restaurant;
    },
  );
};

export default locationsRoutes;
