import { formatSgdCents } from "@/lib/money/format";
import styles from "./wallet-view.module.css";

/** Both layouts use SGD; the compact mobile design omits the leading S. */
export function WalletMoney({ cents, className = "" }: { readonly cents: number; readonly className?: string }) {
  const formatted = formatSgdCents(cents);
  return <span aria-label={formatted} className={`${styles.money} ${className}`}>{formatted.replace(/^S\$/, "$")}</span>;
}
