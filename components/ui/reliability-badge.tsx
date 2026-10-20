import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

/** Converts the 0–100 score from the domain to the 5-point scale in the mockups, e.g. 96 → "4.8". */
export function toFivePoint(score: number): string {
  return (score / 20).toFixed(1);
}

/** Thresholds are placeholders until Rishi confirms them. */
export function reliabilityLabel(score: number): "High" | "Medium" | "Low" {
  if (score >= 90) return "High";
  if (score >= 70) return "Medium";
  return "Low";
}

const labelTone = {
  High: "bg-success-muted text-success",
  Medium: "bg-info-muted text-info",
  Low: "bg-destructive/10 text-destructive",
} as const;

const dotTone = {
  High: "bg-success",
  Medium: "bg-info",
  Low: "bg-destructive",
} as const;

interface ReliabilityBadgeProps {
  /** The score on the domain's 0–100 scale. */
  readonly score: number;
  readonly className?: string;
  readonly variant?: "badge" | "profile";
}

/** Pill showing "● Reliability 4.8 / High" (mockups 10, 11, 12). */
export function ReliabilityBadge({ score, className, variant = "badge" }: ReliabilityBadgeProps) {
  const label = reliabilityLabel(score);

  if (variant === "profile") {
    return (
      <span className={cn("inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[10px] text-muted-foreground md:gap-x-2 md:text-sm", className)}>
        <ShieldCheck className="h-3 w-3 shrink-0 text-success dark:text-green-400 md:h-4 md:w-4" aria-hidden="true" />
        <span>Reliability <strong className="font-semibold text-foreground">{toFivePoint(score)}</strong></span>
        <span className={cn(
          "ml-1 rounded-full px-2 py-0.5 text-[9px] font-medium leading-none md:ml-2 md:text-xs",
          label === "High" ? "bg-blue-50 text-blue-700 dark:bg-blue-400/10 dark:text-blue-300"
            : label === "Medium" ? "bg-amber-50 text-amber-800 dark:bg-amber-400/10 dark:text-amber-300"
              : "bg-destructive/10 text-destructive dark:bg-red-400/10 dark:text-red-300",
        )}>{label}</span>
      </span>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-3 py-1 text-sm font-medium",
        labelTone[label],
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotTone[label])} aria-hidden />
      Reliability {toFivePoint(score)} / {label}
    </span>
  );
}
