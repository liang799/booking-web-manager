import { AuthFrame } from "../_components/auth-frame";
import { RegisterForm } from "./register-form";
import { pathWithNext, safeRedirectPath } from "../redirect-path";

/** UC1-01 Register User. */
export default async function RegisterPage({ searchParams }: { readonly searchParams: Promise<{ readonly next?: string | string[] }> }) {
  const destination = safeRedirectPath((await searchParams).next);
  return (
    <AuthFrame
      prompt="Already have an account?"
      switchLabel="Login"
      switchHref={pathWithNext("/login", destination)}
    >
      <RegisterForm next={destination} />
    </AuthFrame>
  );
}
