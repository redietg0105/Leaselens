import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Staff app · LeaseLens" };

export default function StaffPage() {
  return (
    <PlaceholderPage
      title="Staff app"
      description="Triage queue, vendor dispatch, lease review and the manager dashboard."
    />
  );
}
