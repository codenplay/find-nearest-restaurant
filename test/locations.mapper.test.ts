import { describe, expect, it } from 'vitest';

import { fileRecordToDomain } from '../src/modules/locations/locations.mapper.js';

describe('fileRecordToDomain', () => {
  it('parses a seed file record into a domain Restaurant', () => {
    const restaurant = fileRecordToDomain({
      id: '51e1545c-8b65-4d83-82f9-7fcad4a23111',
      name: 'Da Jia Le',
      type: 'Restaurant',
      'opening-hours': '10:00AM-11:00PM',
      image: 'https://tinyurl.com',
      coordinates: 'x=5,y=5',
      radius: 3,
    });

    expect(restaurant).toEqual({
      id: '51e1545c-8b65-4d83-82f9-7fcad4a23111',
      name: 'Da Jia Le',
      type: 'Restaurant',
      x: 5,
      y: 5,
      radius: 3,
      openingHours: '10:00AM-11:00PM',
      image: 'https://tinyurl.com',
    });
  });

  it('parses decimal (float) coordinates', () => {
    const restaurant = fileRecordToDomain({
      id: '51e1545c-8b65-4d83-82f9-7fcad4a23111',
      name: 'Float Spot',
      type: 'Restaurant',
      'opening-hours': '24 hours',
      image: 'https://tinyurl.com',
      coordinates: 'x=12.5,y=7.25',
      radius: 1,
    });

    expect(restaurant.x).toBe(12.5);
    expect(restaurant.y).toBe(7.25);
  });
});
