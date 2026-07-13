import { describe, expect, it } from 'vitest';

import { formatCoordinates, parseCoordinates } from '../../src/utils/coordinates.js';

describe('coordinates', () => {
  it('formats x/y into the wire string format', () => {
    expect(formatCoordinates(2, 3)).toBe('x=2,y=3');
    expect(formatCoordinates(0, 0)).toBe('x=0,y=0');
    expect(formatCoordinates(12.5, 7.25)).toBe('x=12.5,y=7.25');
  });

  it('parses a well-formed integer coordinates string', () => {
    expect(parseCoordinates('x=2,y=3')).toEqual({ x: 2, y: 3 });
  });

  it('parses decimal (float) coordinates', () => {
    expect(parseCoordinates('x=12.5,y=7.25')).toEqual({ x: 12.5, y: 7.25 });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseCoordinates('  x=10,y=20  ')).toEqual({ x: 10, y: 20 });
  });

  it('throws on malformed input', () => {
    expect(() => parseCoordinates('2,3')).toThrow();
    expect(() => parseCoordinates('x=-1,y=2')).toThrow();
    expect(() => parseCoordinates('x=1.5.5,y=2')).toThrow();
    expect(() => parseCoordinates('x=abc,y=2')).toThrow();
  });
});
