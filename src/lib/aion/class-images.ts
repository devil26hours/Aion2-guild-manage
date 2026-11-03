/**
 * Class emblem images supplied by the project owner in
 * `public/image/class-pic/`. Lookup is by class name (case-insensitive) so
 * it works for both the demo classes and class names returned by the API.
 *
 * AION 2 calls the Spiritmaster class "Elementalist", so the demo data's
 * "Spiritmaster" uses the Elementalist emblem.
 */
const BASE = "/image/class-pic";

const FILES: Record<string, string> = {
  assassin: "class-assassin.png",
  chanter: "class-chanter.png",
  cleric: "class-cleric.png",
  elementalist: "class-elementalist.png",
  spiritmaster: "class-elementalist.png",
  gladiator: "class-gladiator.png",
  ranger: "class-ranger.png",
  sorcerer: "class-sorcerer.png",
  templar: "class-templar.png",
};

export function classImageSrc(name: string | null | undefined): string | null {
  const file = name ? FILES[name.trim().toLowerCase()] : undefined;
  return file ? `${BASE}/${file}` : null;
}
