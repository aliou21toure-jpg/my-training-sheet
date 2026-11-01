/**
 * Weights are always STORED in kilograms. The kg/lb setting only changes
 * what is shown and what is typed. Pure functions.
 */
export type WeightUnit = "kg" | "lb";

export const LB_PER_KG = 2.2046226218;

/** kg → number to display in the chosen unit (1 decimal max). */
export function toDisplayWeight(kg: number, unit: WeightUnit): number {
  const value = unit === "lb" ? kg * LB_PER_KG : kg;
  return Math.round(value * 10) / 10;
}

/** typed number in the chosen unit → kg (2 decimals, as stored). */
export function fromDisplayWeight(value: number, unit: WeightUnit): number {
  const kg = unit === "lb" ? value / LB_PER_KG : value;
  return Math.round(kg * 100) / 100;
}

const frNumber = (n: number) => (Number.isInteger(n) ? String(n) : String(n).replace(".", ","));

/** "42,5 kg", "93,7 lb" */
export function formatWeight(kg: number, unit: WeightUnit): string {
  return `${frNumber(toDisplayWeight(kg, unit))} ${unit}`;
}

export function formatDisplayNumber(kg: number, unit: WeightUnit): string {
  return frNumber(toDisplayWeight(kg, unit));
}
