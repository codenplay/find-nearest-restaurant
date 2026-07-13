import { PrismaClient } from '@prisma/client';

let client: PrismaClient | undefined;

/** Lazily-created singleton so the whole process shares one connection pool. */
export function getPrismaClient(): PrismaClient {
  client ??= new PrismaClient();
  return client;
}
