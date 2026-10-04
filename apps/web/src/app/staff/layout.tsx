import { AppHeader } from "@/components/app-header";
import { redirectIfWrongArea } from "@/lib/session";

/** Shell for /staff. The access check itself is in each page (requireArea). */
export default async function Layout({ children }: { children: React.ReactNode }) {
  const user = await redirectIfWrongArea("/staff");
  return (
    <>
      {user && <AppHeader user={user} />}
      {children}
    </>
  );
}
