import crypto from "crypto";

interface OAuthSession {
  state: string;
  clientType: "web" | "cli";
  codeVerifierHash: string;
  expiresAt: number;
}

export class OAuthSessionService {
  private sessions = new Map<string, OAuthSession>();
  private readonly ttlMs: number;

  constructor(ttlMs = 10 * 60 * 1000) {
    this.ttlMs = ttlMs;
    setInterval(() => this.cleanupExpiredSessions(), 60 * 1000);
  }

  createSession(
    state: string,
    codeVerifier: string,
    clientType: "web" | "cli",
  ): OAuthSession {
    const session: OAuthSession = {
      state,
      clientType,
      codeVerifierHash: this.hashCodeVerifier(codeVerifier),
      expiresAt: Date.now() + this.ttlMs,
    };

    this.sessions.set(state, session);
    return session;
  }

  getSession(state: string): OAuthSession | null {
    const session = this.sessions.get(state);

    if (!session) {
      return null;
    }

    if (Date.now() > session.expiresAt) {
      this.sessions.delete(state);
      return null;
    }

    return session;
  }

  validateSession(
    state: string,
    codeVerifier: string,
    clientType?: string,
  ): OAuthSession | null {
    const session = this.getSession(state);

    if (!session) {
      return null;
    }

    const matchesVerifier =
      session.codeVerifierHash === this.hashCodeVerifier(codeVerifier);
    const matchesClientType = !clientType || session.clientType === clientType;

    if (!matchesVerifier || !matchesClientType) {
      return null;
    }

    return session;
  }

  consumeSession(state: string): void {
    this.sessions.delete(state);
  }

  private hashCodeVerifier(codeVerifier: string): string {
    return crypto.createHash("sha256").update(codeVerifier).digest("hex");
  }

  private cleanupExpiredSessions(): void {
    const now = Date.now();

    for (const [state, session] of this.sessions.entries()) {
      if (now > session.expiresAt) {
        this.sessions.delete(state);
      }
    }
  }
}

export const oauthSessionService = new OAuthSessionService();
