import type { Metadata } from "next";
import { PlaceholderPage } from "@/components/placeholder-page";

export const metadata: Metadata = { title: "Tenant portal · LeaseLens" };

export default function TenantPage() {
  return (
    <PlaceholderPage
      title="Tenant portal"
      description="Sign in with a link sent to your email, then report a problem in your apartment."
    />
  );
}
