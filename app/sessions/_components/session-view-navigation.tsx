"use client";

import Link from "next/link";
import styles from "./session-view-navigation.module.css";

type SessionViewNavigationProps =
  | { readonly active: "groups" }
  | { readonly active: "joined" | "hosting"; readonly onTabChange: (tab: "joined" | "hosting") => void };

/** The existing Sessions navigation, continued onto its mobile Groups destination. */
export function SessionViewNavigation(props: SessionViewNavigationProps) {
  return (
    <nav className={styles.tabs} aria-label="Session views">
      {props.active === "groups" ? (
        <>
          <Link href="/sessions">Joined</Link>
          <Link href="/sessions?tab=hosting">Hosting</Link>
        </>
      ) : (
        <>
          <button type="button" aria-current={props.active === "joined" ? "page" : undefined} onClick={() => props.onTabChange("joined")}>Joined</button>
          <button type="button" aria-current={props.active === "hosting" ? "page" : undefined} onClick={() => props.onTabChange("hosting")}>Hosting</button>
        </>
      )}
      <Link href="/groups" className={styles.mobileGroups} aria-current={props.active === "groups" ? "page" : undefined}>Groups</Link>
    </nav>
  );
}
