"use client";

import { PageHeader } from "@/components/layout/page-header";
import { useT } from "@/lib/i18n";
import { FeedbackDashboard } from "./feedback-dashboard";

/** /dev/feedback. The DEV gate lives in the /dev layout; the APIs behind this page check the role again. */
export function FeedbackDashboardPage() {
  const t = useT();
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader eyebrow={t("Developer")} title={t("Feedback Management")} description={t("Review what the community has sent.")} />
      <FeedbackDashboard />
    </div>
  );
}
