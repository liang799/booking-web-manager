import Link from "next/link";
import { redirect } from "next/navigation";
import { getCreateSessionAction } from "@/app/sessions/session-actions";
import { Button } from "@/components/ui/button";
import { ErrorMessage } from "@/components/ui/error-message";
import { InfoNote } from "@/components/ui/info-note";
import { PageHeader } from "@/components/ui/page-header";
import { getCurrentUser } from "@/lib/supabase/current-user";
import { EmailVerificationForm } from "./email-verification-form";
import { HOME_PATH, pathWithNext, safeRedirectPath } from "@/app/(auth)/redirect-path";

export const dynamic = "force-dynamic";

export default async function EmailVerificationPage({ searchParams }: { readonly searchParams: Promise<{ readonly verification?: string; readonly next?: string | string[] }> }) {
  const { verification, next } = await searchParams;
  const destination = safeRedirectPath(next);
  const user = await getCurrentUser();
  if (user === null || user.accountStatus !== "ACTIVE") redirect(pathWithNext("/login", pathWithNext("/profile/email", destination)));
  const create = getCreateSessionAction(user);
  return (
    <>
      <PageHeader breadcrumb="Settings" title="Email address" />
      <div className="space-y-4 p-4 md:p-8">
        <Link href="/profile" className="text-sm font-medium text-muted-foreground hover:text-foreground">← Back to settings</Link>
        <div className="max-w-2xl space-y-5 rounded-lg border bg-card p-6">
          {verification === "failed" && !user.emailVerified && <ErrorMessage>We couldn&apos;t finish that confirmation link. Check your verification status below or request a new link.</ErrorMessage>}
          {verification === "pending" && !user.emailVerified && <InfoNote icon>Confirm any remaining email links, then check your verification status below.</InfoNote>}
          <EmailVerificationForm
            key={JSON.stringify([user.id, user.email, user.pendingEmail, user.emailVerified])}
            email={user.email}
            pendingEmail={user.pendingEmail}
            emailVerified={user.emailVerified}
            next={destination}
          />
          <div className="flex flex-wrap gap-3">
            {destination !== HOME_PATH && <Button asChild className="min-h-11"><Link href={destination}>Continue where you left off</Link></Button>}
            <Button asChild variant="outline" className="min-h-11"><Link href="/discover">Browse sessions</Link></Button>
            {create !== undefined && <Button asChild className="min-h-11"><Link href={create.href}>Create a session</Link></Button>}
          </div>
        </div>
      </div>
    </>
  );
}
