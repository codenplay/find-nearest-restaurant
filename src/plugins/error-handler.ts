import fp from 'fastify-plugin';
import type { FastifyError, FastifyPluginAsync } from 'fastify';

import { InvalidCredentialsError } from '../modules/auth/auth.service.js';
import {
  RestaurantIdMismatchError,
  RestaurantNotFoundError,
} from '../modules/locations/locations.service.js';

/**
 * Central error mapping. Domain errors thrown by services are translated to the right HTTP
 * status here, keeping that concern out of the route handlers. Anything unexpected is logged
 * with full detail server-side but returns a generic message to the client.
 */
const errorHandlerPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof RestaurantNotFoundError) {
      return reply.code(404).send({
        statusCode: 404,
        error: 'Not Found',
        message: error.message,
      });
    }

    if (error instanceof RestaurantIdMismatchError) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: error.message,
      });
    }

    if (error instanceof InvalidCredentialsError) {
      return reply.code(401).send({
        statusCode: 401,
        error: 'Unauthorized',
        message: error.message,
      });
    }

    // Beyond this point, any remaining error is either a genuine FastifyError (schema
    // validation, rate limiting, ...) or an unexpected bug - both carry Error's base shape.
    const fastifyError = error as FastifyError;

    // Fastify schema validation failures already carry statusCode 400 and a useful message.
    if (fastifyError.validation) {
      return reply.code(400).send({
        statusCode: 400,
        error: 'Bad Request',
        message: fastifyError.message,
      });
    }

    if (fastifyError.statusCode && fastifyError.statusCode < 500) {
      return reply.code(fastifyError.statusCode).send({
        statusCode: fastifyError.statusCode,
        error: fastifyError.name,
        message: fastifyError.message,
      });
    }

    request.log.error({ err: error }, 'Unhandled error while processing request');
    return reply.code(500).send({
      statusCode: 500,
      error: 'Internal Server Error',
      message: 'An unexpected error occurred',
    });
  });

  fastify.setNotFoundHandler((request, reply) => {
    return reply.code(404).send({
      statusCode: 404,
      error: 'Not Found',
      message: `Route ${request.method} ${request.url} not found`,
    });
  });
};

export default fp(errorHandlerPlugin, { name: 'error-handler-plugin' });
