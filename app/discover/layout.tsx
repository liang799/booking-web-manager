import { pathWithNext } from "@/app/(auth)/redirect-path";
import { SignedInShell } from "@/app/(auth)/_components/signed-in-shell";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { redirect } from "next/navigation";

/** Discovery is a signed-in screen, not a public fallback during auth outages. */
export default async function DiscoveryLayout({ children }: { readonly children: React.ReactNode }) {
  const user = await getCurrentUser().catch(() => null);
  if (user === null || user.accountStatus !== "ACTIVE") redirect(pathWithNext("/login", "/discover"));
  return <SignedInShell mobileVariant="focused">{children}</SignedInShell>;
}
