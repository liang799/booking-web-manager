import Link from "next/link";
import { BookingLogo } from "@/components/ui/booking-logo";

/** Invitation previews are public and do not require the personal navigation shell. */
export default function InvitationLayout({ children }: { readonly children: React.ReactNode }) {
  return <div className="min-h-screen bg-background">
    <header className="mx-auto max-w-5xl border-b px-6 py-5 md:px-8">
      <Link href="/" aria-label="Home" className="inline-flex"><BookingLogo /></Link>
    </header>
    <main>{children}</main>
  </div>;
}
