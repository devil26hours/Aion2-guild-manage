import { toBlob } from "html-to-image";

/**
 * Character Lookup equipment export: a capture of the equipment display exactly as the page renders it
 * (same markup, same styles). The live node is cloned off-screen so hover/focus state and the collapsed
 * "Appearance skins" section never appear; item icons are routed through /api/aion2/icon (same-origin,
 * the image CDN sends no CORS headers) so they can be drawn into the PNG.
 */

const PIXEL_RATIO = 2;

function proxied(src: string): string {
  try {
    const u = new URL(src, window.location.href);
    return u.origin === window.location.origin ? src : `/api/aion2/icon?u=${encodeURIComponent(u.href)}`;
  } catch {
    return src;
  }
}

export async function renderEquipmentPng(source: HTMLElement): Promise<Blob> {
  if (document.fonts) await document.fonts.ready;
  const width = Math.ceil(source.getBoundingClientRect().width);

  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  host.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;pointer-events:none;`;
  const clone = source.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("details").forEach((d) => d.remove()); // collapsed extras (skins) are not part of the equipment view
  clone.querySelectorAll("[tabindex]").forEach((el) => el.removeAttribute("tabindex"));
  host.appendChild(clone);
  document.body.appendChild(host);
  try {
    const imgs = [...clone.querySelectorAll("img")];
    await Promise.all(
      imgs.map(
        (img) =>
          new Promise<void>((resolve) => {
            img.loading = "eager";
            img.referrerPolicy = "no-referrer";
            img.onload = img.onerror = () => resolve();
            img.removeAttribute("srcset");
            img.src = proxied(img.getAttribute("src") ?? "");
            if (img.complete) resolve();
          }),
      ),
    );
    const bg = getComputedStyle(document.body).backgroundColor;
    const blob = await toBlob(clone, {
      pixelRatio: PIXEL_RATIO,
      cacheBust: false,
      backgroundColor: bg && bg !== "rgba(0, 0, 0, 0)" ? bg : undefined,
      width,
    });
    if (!blob) throw new Error("PNG encoding failed.");
    return blob;
  } finally {
    host.remove();
  }
}

export function equipmentFileName(name: string, date = new Date()): string {
  const slug =
    name
      .toLowerCase()
      .normalize("NFKD")
      .replace(/[^\w\s-]/g, "")
      .trim()
      .replace(/[\s_]+/g, "-")
      .slice(0, 48) || "character";
  return `aion2-equipment-${slug}-${date.toISOString().slice(0, 10)}.png`;
}
