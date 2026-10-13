import type { Metadata } from "next";
import Link from "next/link";
import { InfoNote } from "@/components/ui/info-note";
import { InfoPage, InfoSection } from "../_components/info-page";

export const metadata: Metadata = { title: "Privacy | Booking Web Manager" };

/** What Booking. keeps about a player and how to control it. Public, so it can be read before registering. */
export default function PrivacyPage() {
  return (
    <InfoPage title="Privacy and security" intro="What Booking. keeps about you, who can see it, and how to control it.">
      <InfoNote icon>
        Booking. is an NTU SC2006 student project running in test mode. It is not a licensed payment service.
      </InfoNote>

      <InfoSection id="privacy-collect" title="What we keep">
        <ul>
          <li>Your account: display name and email address. When you register or log in, your password is passed to our sign-in provider, Supabase, which stores it securely; we never store it ourselves.</li>
          <li>Your preferences: the sports and regions you choose.</li>
          <li>Your activity: sessions you create, join, wait for or leave, attendance, and the groups you belong to.</li>
          <li>Your wallet records: top-ups, held shares, refunds and releases.</li>
          <li>If you turn on notifications, the address your browser gives us for sending them.</li>
        </ul>
      </InfoSection>

      <InfoSection id="privacy-not-collect" title="What we don't keep">
        <ul>
          <li>Your location. Venues are found by searching, not from your device.</li>
          <li>Card or bank details. Payments go through Stripe.</li>
          <li>Advertising or tracking cookies. The only cookies keep you logged in. An unconfirmed wallet request is remembered in your browser so it can be retried safely.</li>
        </ul>
      </InfoSection>

      <InfoSection id="privacy-use" title="How it is used">
        <p>
          To run sessions and your wallet: holding and refunding shares, releasing them to bookers, working out your
          reliability score and sending the notifications you turn on.
        </p>
      </InfoSection>

      <InfoSection id="privacy-visible" title="Who can see it">
        <ul>
          <li>Bookers see the display names of people in their sessions.</li>
          <li>Group members see each other&apos;s display names.</li>
          <li>Your email address and wallet are never shown to other players.</li>
        </ul>
      </InfoSection>

      <InfoSection id="privacy-where" title="Where it is stored">
        <p>In Singapore: the database runs on Supabase and the app on Vercel, both in their Singapore regions.</p>
      </InfoSection>

      <InfoSection id="privacy-security" title="How your account is protected">
        <ul>
          <li>Every request is checked against your login on the server, and database rules limit what each account can read and change.</li>
          <li>Each change to your wallet carries a unique request key, so retrying never applies it twice.</li>
          <li>A deleted account is signed out and can&apos;t be used again.</li>
        </ul>
      </InfoSection>

      <InfoSection id="privacy-control" title="Your controls">
        <ul>
          <li><Link href="/profile/email">Add or confirm your email address</Link></li>
          <li><Link href="/profile/edit">Edit your name and preferences</Link></li>
          <li><Link href="/profile">Turn notifications on or off</Link> in Settings</li>
          <li>
            <Link href="/profile/delete">Delete your account</Link>: your name, email and preferences are removed. Past
            session and wallet records are kept without your name, for audit.
          </li>
        </ul>
      </InfoSection>
    </InfoPage>
  );
}
