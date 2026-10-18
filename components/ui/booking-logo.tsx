import { cn } from "@/lib/utils";

export interface BookingLogoProps {
  /** Navigation stays quiet; display is reserved for a page's main brand heading. */
  readonly size?: "navigation" | "display";
  /** Inherit for fixed-colour artwork; adaptive follows the app's light/dark theme. */
  readonly tone?: "adaptive" | "inherit";
  readonly className?: string;
}

/** Shared Booking. wordmark: Inter Black and zero tracking, with a quiet navigation default. */
export function BookingLogo({ size = "navigation", tone = "adaptive", className }: BookingLogoProps) {
  return (
    <span className={cn(
      "whitespace-nowrap font-sans font-black not-italic normal-case tracking-normal",
      size === "display" ? "text-5xl lg:text-6xl" : "text-[20px] leading-[normal]",
      tone === "inherit" ? "text-inherit" : "text-black dark:text-foreground",
      className,
    )}>
      Booking.
    </span>
  );
}
