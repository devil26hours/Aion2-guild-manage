export { cn } from "cn"

/**
 * For a class / rarity / grade colour used as text: nudges it toward black or
 * white (--data-tone, set per theme) so it stays readable. Marks and frames keep
 * the raw colour.
 */
export function dataText(color: string): string {
  return `color-mix(in oklab, ${color}, var(--data-tone))`
}
