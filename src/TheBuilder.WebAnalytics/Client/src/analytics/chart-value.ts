export function formatChartAxisValue(
  value: number,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string = (number, options) => number.toLocaleString(undefined, options),
): string {
  if (Math.abs(value) < 1_000) return formatNumber(value);

  const compactValue = Math.round((value / 1_000) * 10) / 10;
  return `${formatNumber(compactValue, { maximumFractionDigits: 1 })}k`;
}
