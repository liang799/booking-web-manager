import { Money as DomainMoney } from "@/domain";
import { formatSgd } from "@/lib/money/allocation";
import styles from "./wallet-view.module.css";

/** Both layouts use SGD; the compact mobile design omits the leading S. */
export function WalletMoney({ cents, className = "" }: { readonly cents: number; readonly className?: string }) {
  const formatted = formatSgd(DomainMoney.fromCents(cents));
  return <span aria-label={formatted} className={`${styles.money} ${className}`}>{formatted.replace(/^S\$/, "$")}</span>;
}
