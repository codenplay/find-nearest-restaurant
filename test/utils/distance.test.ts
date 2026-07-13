import { describe, expect, it } from 'vitest';

import { euclideanDistance, roundDistance } from '../../src/utils/distance.js';

describe('distance', () => {
  it('computes euclidean distance', () => {
    expect(euclideanDistance(0, 0, 3, 4)).toBe(5);
    expect(euclideanDistance(3, 2, 2, 2)).toBe(1);
  });

  it('rounds to 5 decimal places', () => {
    expect(roundDistance(euclideanDistance(3, 2, 2, 3))).toBe(1.41421);
  });
});
