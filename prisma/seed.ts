import 'dotenv/config';

import { readFile } from 'node:fs/promises';

import { PrismaClient } from '@prisma/client';

import {
  fileRecordToDomain,
  type RestaurantFileRecord,
} from '../src/modules/locations/locations.mapper.js';
import { PrismaLocationsRepository } from '../src/modules/locations/locations.repository.js';

const CHUNK_SIZE = 200;

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Seeds/imports restaurants from a JSON file (`{ "locations": [...] }`) into the database via
 * true upsert-by-id - re-running this against a modified file updates existing rows instead of
 * skipping them. This is a deliberate, separate, manual command: nothing in app.ts/server.ts
 * ever calls this, so nothing auto-imports on startup.
 *
 *   npm run db:seed                              # seeds ./data/locations.json
 *   npm run db:seed -- ./data/locations_big.json # seeds an arbitrary file
 */
async function main(): Promise<void> {
  const filePath = process.argv[2] ?? './data/locations.json';
  const raw = await readFile(filePath, 'utf-8');
  const { locations } = JSON.parse(raw) as { locations: RestaurantFileRecord[] };
  const restaurants = locations.map(fileRecordToDomain);

  const prisma = new PrismaClient();
  try {
    const repository = await PrismaLocationsRepository.load(prisma);

    let processed = 0;
    for (const batch of chunk(restaurants, CHUNK_SIZE)) {
      await Promise.all(batch.map((restaurant) => repository.upsert(restaurant)));
      processed += batch.length;
      console.log(`Upserted ${processed}/${restaurants.length} restaurant(s) from ${filePath}...`);
    }

    console.log(`Done: upserted ${restaurants.length} restaurant(s) from ${filePath}.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed failed:', error);
  process.exitCode = 1;
});
