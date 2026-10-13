import type { Metadata } from "next";
import { SignedInShell } from "@/app/(auth)/_components/signed-in-shell";

export const metadata: Metadata = { title: "Payout account | Booking Web Manager" };

export default function PayoutsLayout({ children }: { readonly children: React.ReactNode }) {
  return <SignedInShell>{children}</SignedInShell>;
}
