import { AppHeader } from "@/components/app-header";
import { redirectIfWrongArea } from "@/lib/session";

/** Shell for /tenant. The access check itself is in each page (requireArea). */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await redirectIfWrongArea("/tenant");
  return (
    <>
      {user && <AppHeader user={user} />}
      {children}
    </>
  );
}
