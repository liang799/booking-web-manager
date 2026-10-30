import { ArrowDown, ArrowUpRight, CircleArrowDown, CirclePlus, CreditCard, LockKeyhole, RotateCcw, type LucideIcon } from "lucide-react";
import type { WalletSummary, WalletTransactionKind } from "../wallet-transport";

export function walletHoldHref(hold: Pick<WalletSummary["activeHolds"][number], "sessionId" | "isBooker">) {
  return hold.isBooker ? `/sessions/${encodeURIComponent(hold.sessionId)}/participants`
    : `/sessions?tab=joined&session=${encodeURIComponent(hold.sessionId)}`;
}

export const transactionDetails: Readonly<Record<WalletTransactionKind, {
  label: string; tableLabel: string; description: string; icon: LucideIcon; mobileIcon?: LucideIcon; direction: "in" | "out" | "neutral";
}>> = {
  TOP_UP: { label: "Top up", tableLabel: "Top up", description: "Added funds to your wallet", icon: CirclePlus, direction: "in" },
  LOCK: { label: "Funds held", tableLabel: "Hold", description: "Reserved for a session", icon: LockKeyhole, direction: "out" },
  REFUND: { label: "Refund", tableLabel: "Refund", description: "Returned to your available balance", icon: RotateCcw, direction: "in" },
  // The API returns magnitudes, not the viewer's ledger leg. Settlement is not a wallet credit.
  RELEASE: { label: "Payment released", tableLabel: "Release", description: "Held share settled to the booker", icon: ArrowUpRight, mobileIcon: CircleArrowDown, direction: "neutral" },
  FORFEIT: { label: "Forfeited share", tableLabel: "Forfeiture", description: "Held share forfeited to the booker", icon: CreditCard, direction: "neutral" },
  PAYOUT: { label: "Payout", tableLabel: "Payout", description: "Transferred to a payout account", icon: ArrowDown, direction: "neutral" },
};

export const singaporeDateTime = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
});

export function mobileActivityDate(timestamp: string) {
  const date = new Date(timestamp);
  const dateKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" });
  const today = new Date();
  if (dateKey.format(date) === dateKey.format(today)) return "Today";
  if (dateKey.format(date) === dateKey.format(new Date(today.getTime() - 86_400_000))) return "Yesterday";
  const age = today.getTime() - date.getTime();
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    ...(age >= 0 && age < 7 * 86_400_000 ? { weekday: "long" } : { day: "numeric", month: "short" }),
  }).format(date);
}

export const tableDateTime = new Intl.DateTimeFormat("en-SG", {
  timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});
