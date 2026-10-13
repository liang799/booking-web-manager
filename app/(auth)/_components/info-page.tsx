import Link from "next/link";
import { BookingLogo } from "@/components/ui/booking-logo";

/** One titled block of plain-language information on the Terms, Privacy and Help pages. */
export function InfoSection({ id, title, children }: {
  /** Unique on the page; labels the section for screen readers. */
  readonly id: string;
  readonly title: string;
  readonly children: React.ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="space-y-2">
      <h2 id={id} className="text-lg font-semibold">{title}</h2>
      <div className="space-y-2 text-sm leading-relaxed text-muted-foreground [&_a]:font-medium [&_a]:text-foreground [&_a]:underline [&_a]:underline-offset-4 [&_ul]:list-disc [&_ul]:space-y-1 [&_ul]:pl-5">
        {children}
      </div>
    </section>
  );
}

/**
 * Frame for the public Terms and Privacy pages: readable before signing up (the register form
 * links here), so it has no app sidebar, like the log-in and register pages.
 */
export function InfoPage({ title, intro, children }: {
  readonly title: string;
  readonly intro: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="flex flex-wrap items-center justify-between gap-4 border-b px-4 py-4 md:px-10">
        <Link href="/" className="inline-flex min-h-11 items-center rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2">
          <BookingLogo />
        </Link>
        <nav aria-label="Policies" className="flex gap-4 text-sm font-medium">
          <Link href="/terms" className="inline-flex min-h-11 items-center hover:underline">Terms</Link>
          <Link href="/privacy" className="inline-flex min-h-11 items-center hover:underline">Privacy</Link>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-3xl space-y-8 px-4 py-8 md:px-8 md:py-12">
        <div className="space-y-2">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{title}</h1>
          <p className="text-sm leading-relaxed text-muted-foreground">{intro}</p>
        </div>
        {children}
      </main>
    </div>
  );
}
