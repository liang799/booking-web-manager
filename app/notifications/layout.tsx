import { SignedInShell } from "@/app/(auth)/_components/signed-in-shell";

export default function NotificationsLayout({ children }: { children: React.ReactNode }) {
  return <SignedInShell>{children}</SignedInShell>;
}
