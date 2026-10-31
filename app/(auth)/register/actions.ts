"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { UserHandlesUnavailableError } from "@/app/users/user-handle-dependencies";
import { getUserHandleDependencies } from "@/app/users/user-handle-server-dependencies";
import { emailConfirmationRedirectTo } from "../email-confirmation-url";
import { safeRedirectPath } from "../redirect-path";
import { registerSchema } from "../schemas";
import { RegisteredEmailsUnavailableError } from "./registered-emails";
import { getRegisteredEmails } from "./registered-emails-server";

type RegisterField = "displayName" | "email" | "password" | "region" | "sport" | "handle";

export interface RegisterState {
  readonly status: "idle" | "error" | "check-email";
  readonly email?: string;
  readonly message?: string;
  readonly fieldErrors?: Partial<Record<RegisterField, string[]>>;
  /** True when the email already has an account (UC1-01 exception 4a). */
  readonly emailTaken?: boolean;
}

/** UC1-01 exception 4a: the email already has an account, so the user is asked to log in. */
const EMAIL_TAKEN: RegisterState = {
  status: "error",
  message: "An account with this email already exists.",
  emailTaken: true,
};

/** UC1-01 Register User: creates the account, then returns to a safe app destination. */
export async function registerUser(
  _previous: RegisterState,
  formData: FormData,
): Promise<RegisterState> {
  // 1. Validate at the boundary (CLAUDE.md: "Validate at the boundary with Zod").
  const parsed = registerSchema.safeParse({
    displayName: formData.get("displayName") ?? "",
    email: formData.get("email") ?? "",
    password: formData.get("password") ?? "",
    region: formData.get("region") ?? "",
    sport: formData.get("sport") ?? "",
    handle: formData.get("handle") ?? "",
  });
  if (!parsed.success) {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: parsed.error.flatten().fieldErrors,
    };
  }

  // 2. UC1-01 exception 4a, before asking Supabase: for an email whose account isn't
  //    confirmed yet, Supabase resends that account's confirmation email and answers
  //    like a new sign-up, so this check is the only one that catches it.
  const { displayName, email, password, region, sport, handle } = parsed.data;
  if (await emailHasAccount(email)) return EMAIL_TAKEN;

  // 3. The user ID must be free. The sign-up trigger checks again, because another
  //    sign-up may take it before this one finishes (ADR-0021).
  if ((await handleAvailability(handle)) === "TAKEN") {
    return {
      status: "error",
      message: "Please fix the highlighted fields.",
      fieldErrors: { handle: ["That user ID is taken. Try another."] },
    };
  }

  // 4. Create the account. Migration 0004's trigger then creates the profile and S$0.00 wallet.
  const destination = safeRedirectPath(formData.get("next"));
  const emailRedirectTo = await emailConfirmationRedirectTo(destination);
  if (emailRedirectTo === null) {
    return { status: "error", message: "We couldn't prepare your confirmation link. Reload this page and try again." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo,
      data: {
        display_name: displayName,
        preferred_sports: [sport],
        preferred_regions: [region],
        handle,
      },
    },
  });

  // 5. UC1-01 exception 4a again, for an account created since step 2 or when the
  //    check was unavailable: Supabase reports confirmed duplicates itself.
  const duplicate =
    error?.code === "user_already_exists" ||
    // With email confirmation on, Supabase hides duplicates by returning a user with no identities.
    (error === null && data.user !== null && data.user.identities?.length === 0);
  if (duplicate) return EMAIL_TAKEN;

  if (error !== null) {
    // Provider messages may echo the callback URL, which can carry an invitation token.
    console.error("UC1-01 sign-up failed:", error.code);
    return {
      status: "error",
      message: "We couldn't create your account. Please try again.",
    };
  }

  // 6. If email confirmation is on, there is no session yet: ask the user to check their inbox.
  if (data.session === null) {
    return {
      status: "check-email",
      email,
      message: "Account created. Check your email for a confirmation link, then log in.",
    };
  }

  // 7. Return to the reviewed invitation or Home; joining still requires confirmation.
  redirect(destination);
}

/** False when emails cannot be checked here; Supabase Auth still reports confirmed duplicates. */
async function emailHasAccount(email: string): Promise<boolean> {
  try {
    return await (await getRegisteredEmails()).hasAccount(email);
  } catch (error) {
    if (!(error instanceof RegisteredEmailsUnavailableError)) console.error("UC1-01 email check failed:", error);
    return false;
  }
}

/** UNKNOWN when user IDs cannot be checked here; the sign-up trigger still keeps them unique. */
async function handleAvailability(handle: string): Promise<"AVAILABLE" | "TAKEN" | "INVALID" | "UNKNOWN"> {
  try {
    return await (await getUserHandleDependencies()).checkUserHandle.availability(handle);
  } catch (error) {
    if (!(error instanceof UserHandlesUnavailableError)) console.error("UC1-01 user ID check failed:", error);
    return "UNKNOWN";
  }
}
