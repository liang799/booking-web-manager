/** The server has no database settings, so sign-up cannot check emails beforehand. */
export class RegisteredEmailsUnavailableError extends Error {
  constructor() {
    super("Registered emails cannot be checked right now");
    this.name = "RegisteredEmailsUnavailableError";
  }
}

/** UC1-01: whether an email already belongs to an account, including one not yet confirmed. */
export interface RegisteredEmails {
  hasAccount(email: string): Promise<boolean>;
}
