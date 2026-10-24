import { subscribeToDiscoveryInvalidation } from "@/lib/sessions/supabase-discovery-subscription";

/** Optional browser transport; DATABASE_URL-only discovery remains usable. */
export function subscribeToDiscoveryChanges(invalidate: () => void): () => void {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (!url || !key) return () => {};
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return () => {};
    return subscribeToDiscoveryInvalidation({ url, key }, invalidate);
  } catch {
    // Invalid/unavailable Realtime must never prevent public discovery rendering.
    // The controller's reconciliation timer continues to use the server read path.
    return () => {};
  }
}
