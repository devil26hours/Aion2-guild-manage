import type { Metadata } from "next";
import { FeedbackDashboardPage } from "@/components/feedback/feedback-dashboard-page";

export const metadata: Metadata = {
  title: "Feedback Management — DEV — ChumChon AION2",
};

export default function DevFeedbackPage() {
  return <FeedbackDashboardPage />;
}
