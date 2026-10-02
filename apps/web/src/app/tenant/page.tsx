import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";
import { requireArea } from "@/lib/session";

export const metadata: Metadata = { title: "Tenant portal · LeaseLens" };

export default async function TenantPage() {
  const user = await requireArea("/tenant");
  return (
    <PlaceholderPage
      title={`Hi, ${user.name.split(" ")[0]}`}
      description={
        user.role === "VENDOR"
          ? "Your assigned jobs will appear here."
          : "Report a problem in your apartment and track your requests here."
      }
    />
  );
}
