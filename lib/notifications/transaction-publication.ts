/** A fresh recipient collection belongs to exactly one database transaction attempt. */
export async function withNotificationPublication<T>(
  commit: (recipients: Set<string>) => Promise<T>,
  publish: (recipients: readonly string[]) => void,
): Promise<T> {
  const recipients = new Set<string>();
  const result = await commit(recipients);
  if (recipients.size > 0) {
    try { publish([...recipients]); } catch { /* The database result is already committed. */ }
  }
  return result;
}
