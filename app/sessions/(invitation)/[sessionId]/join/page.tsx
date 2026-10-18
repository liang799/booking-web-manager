import type { Metadata } from "next";
import { SessionInvitationView } from "@/app/sessions/_components/session-invitation-view";
import { loadInvitationScreen } from "@/app/sessions/invitation-screen";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Session invitation", robots: { index: false, follow: false }, referrer: "no-referrer",
};

export default async function SessionInvitationPage({ params, searchParams }: {
  readonly params: Promise<{ sessionId: string }>;
  readonly searchParams: Promise<{ token?: string | string[] }>;
}) {
  const [{ sessionId }, { token }] = await Promise.all([params, searchParams]);
  return <SessionInvitationView outcome={await loadInvitationScreen(sessionId, token)} />;
}
