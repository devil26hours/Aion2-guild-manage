import type { Metadata } from "next";
import { NotificationHistory } from "@/components/notifications/notification-history";

export const metadata: Metadata = {
  title: "Notifications — ChumChon AION2",
};

export default function NotificationsPage() {
  return <NotificationHistory />;
}
