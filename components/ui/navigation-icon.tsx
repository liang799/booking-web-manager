import { Calendar, House, Search, Settings, UsersRound, WalletMinimal } from "lucide-react";
import styles from "./navigation-icon.module.css";

const icons = {
  home: House,
  search: Search,
  sessions: Calendar,
  wallet: WalletMinimal,
  groups: UsersRound,
  settings: Settings,
} as const;

export type NavigationIconName = keyof typeof icons;

/** One size and stroke weight for navigation, with a single flourish on selection or arrival. */
export function NavigationIcon({ name, active }: {
  readonly name: NavigationIconName;
  readonly active: boolean;
}) {
  const Icon = icons[name];

  return (
    <span className={styles.icon} data-active={active} aria-hidden="true">
      <Icon
        className={`${styles.glyph} ${styles[name]}`}
        size={20}
        strokeWidth={1.8}
        focusable="false"
      />
    </span>
  );
}
