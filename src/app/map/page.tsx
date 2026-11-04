import type { Metadata } from "next";
import { InteractiveMapView } from "@/components/map/interactive-map-view";
import { MapPageShell } from "@/components/map/map-page-shell";

export const metadata: Metadata = {
  title: "Interactive Map — ChumChon AION2",
  description: "Interactive AION2 map: monsters, resources, collectibles, teleports and dungeon entrances for every map.",
  alternates: { canonical: "/map" },
};

/** Open to every visitor (guest, member, any role): the proxy lists /map in OPEN_PAGES. All data is static under /map-data/v1. */
export default function MapPage() {
  return (
    <MapPageShell>
      <InteractiveMapView />
    </MapPageShell>
  );
}
