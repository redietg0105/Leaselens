import { AppHeader } from "@/components/app-header";
import { getCurrentUser } from "@/lib/session";

/** Shell for /staff. The access check itself is in each page (requireArea). */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await getCurrentUser();
  return (
    <>
      {user && <AppHeader user={user} area="/staff" />}
      {children}
    </>
  );
}
