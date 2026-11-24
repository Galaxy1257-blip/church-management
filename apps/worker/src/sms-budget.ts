export const DEFAULT_SMS_HOURLY_UNIT_CAP = 5_000;

export function smsHourlyBudgetAllows(usedUnits: number, segments: number, capUnits: number): boolean {
  return usedUnits + segments <= capUnits;
}
