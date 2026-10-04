import { AppHeader } from "@/components/app-header";
import { redirectIfWrongArea } from "@/lib/session";

/** Shell for /vendor. The access check itself is in each page (requireArea). */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await redirectIfWrongArea("/vendor");
  return (
    <>
      {user && <AppHeader user={user} />}
      {children}
    </>
  );
}
