const numberFmt = new Intl.NumberFormat("en-US");

export function formatNumber(value: number): string {
  return numberFmt.format(value);
}

export function formatSigned(value: number): string {
  if (value === 0) return "±0";
  return `${value > 0 ? "+" : "−"}${numberFmt.format(Math.abs(value))}`;
}
