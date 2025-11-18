import { UNITS_PER_CREDIT } from '../../shared/constants.js';

export function creditsToUsageUnits(costInCredits: number) {
  const credits = Number(costInCredits);
  if (!Number.isFinite(credits) || credits <= 0) {
    throw new Error('Resolved cost must be positive.');
  }
  const units = Math.round(credits * UNITS_PER_CREDIT);
  return units > 0 ? units : 1;
}
