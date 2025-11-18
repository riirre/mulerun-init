import { describe, expect, it } from 'vitest';

import { creditsToUsageUnits } from '../functions/utils/metering';
import { UNITS_PER_CREDIT } from '../shared/constants.js';

describe('creditsToUsageUnits', () => {
  it('converts credits to units using shared constant', () => {
    expect(creditsToUsageUnits(12)).toBe(12 * UNITS_PER_CREDIT);
    expect(creditsToUsageUnits(0.5)).toBe(Math.round(0.5 * UNITS_PER_CREDIT));
  });

  it('throws when credits are invalid', () => {
    expect(() => creditsToUsageUnits(0)).toThrow();
    expect(() => creditsToUsageUnits(Number.NaN)).toThrow();
  });
});
