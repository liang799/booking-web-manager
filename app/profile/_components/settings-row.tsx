import { ChevronRight, type LucideIcon } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface SettingsRowProps {
  readonly icon: LucideIcon;
  readonly title: string;
  readonly description?: string;
  /** Where the row goes. Without it, the row shows "Coming soon" and can't be clicked. */
  readonly href?: string;
  readonly tone?: "default" | "danger";
}

/** An accessible account action with a decorative icon and optional supporting text. */
export function SettingsRow({ icon: Icon, title, description, href, tone = "default" }: SettingsRowProps) {
  const danger = tone === "danger";
  const content = (
    <>
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground",
          danger && "bg-destructive/10 text-destructive dark:bg-red-400/10 dark:text-red-400",
        )}
        aria-hidden
      >
        <Icon className="h-5 w-5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm font-medium md:text-base", danger && "text-destructive dark:text-red-400")}>{title}</span>
        {description !== undefined && (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground md:text-sm">{description}</span>
        )}
      </span>
      {href !== undefined ? (
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-muted-foreground", danger && "text-destructive dark:text-red-400")} aria-hidden />
      ) : (
        <span className="shrink-0 text-xs text-muted-foreground">Coming soon</span>
      )}
    </>
  );

  const rowClassName = cn(
    "flex min-h-14 items-center gap-4 px-4 py-2.5 md:gap-5 md:px-6",
    danger && "min-h-[72px] bg-card",
  );

  if (href === undefined) return <div className={cn(rowClassName, "opacity-70")}>{content}</div>;

  return (
    <Link
      href={href}
      className={cn(
        rowClassName,
        "transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
        danger && "hover:bg-destructive/10",
      )}
    >
      {content}
    </Link>
  );
}
