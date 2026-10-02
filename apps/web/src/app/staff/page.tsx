import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";
import { requireArea } from "@/lib/session";

export const metadata: Metadata = { title: "Staff app · LeaseLens" };

export default async function StaffPage() {
  const user = await requireArea("/staff");
  return (
    <PlaceholderPage
      title={`Welcome, ${user.name.split(" ")[0]}`}
      description="Triage queue, vendor dispatch, lease review and the manager dashboard will appear here."
    />
  );
}
