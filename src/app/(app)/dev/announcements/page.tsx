import type { Metadata } from "next";
import { AnnouncementsManager } from "@/components/dev/announcements-manager";

export const metadata: Metadata = {
  title: "Announcements & Notifications — DEV — ChumChon AION2",
};

export default function DevAnnouncementsPage() {
  return <AnnouncementsManager />;
}
