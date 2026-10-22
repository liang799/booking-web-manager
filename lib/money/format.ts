const WHOLE_UNITS = new Intl.NumberFormat("en-SG", {
  useGrouping: true,
  maximumFractionDigits: 0,
});

/**
 * Presentation-only SGD formatting from an integer-cent DTO, with no domain dependency.
 * Separate whole dollars and the remainder before formatting so even safe-integer
 * limits retain every cent. Never parse the display string back into a calculation.
 */
export function formatSgdCents(cents: number): string {
  if (!Number.isSafeInteger(cents)) {
    throw new RangeError("SGD formatting requires a safe integer number of cents");
  }

  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  const fraction = absolute % 100;
  const dollars = (absolute - fraction) / 100;

  return `${sign}S$${WHOLE_UNITS.format(dollars)}.${String(fraction).padStart(2, "0")}`;
}
