"use client";

import { useState, type FormEvent } from "react";
import { ArrowRight, LoaderCircle, Zap } from "lucide-react";
import { api, type Session } from "@/lib/client";
import { ThemeToggle } from "@/components/theme";

export default function SignIn({
  onSignedIn,
  initialError = "",
}: {
  onSignedIn: (session: Session) => void | Promise<void>;
  initialError?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(initialError);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    try {
      const session = await api<Session>("/api/auth/login", "POST", {
        username: String(form.get("username") || "").trim(),
        password: String(form.get("password") || ""),
      });
      await onSignedIn(session);
    } catch (e) {
      setError(
        e instanceof TypeError
          ? "Unable to reach the server."
          : e instanceof Error
            ? e.message
            : "Unable to sign in.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="sign-in-shell">
      <div className="sign-in-theme">
        <ThemeToggle />
      </div>
      <section className="modal sign-in-card" aria-labelledby="sign-in-title">
        <div className="brand">
          <span className="brand-icon">
            <Zap size={19} fill="currentColor" />
          </span>
          <span>issueflow.</span>
        </div>
        <h1 id="sign-in-title">Sign in</h1>
        <form onSubmit={submit}>
          <label>
            Username
            <input
              name="username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
              maxLength={100}
              autoFocus
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete="current-password"
              required
              maxLength={128}
            />
          </label>
          {error && (
            <p className="error-message" role="alert">
              {error}
            </p>
          )}
          <button className="button primary full-width" disabled={busy}>
            {busy ? (
              <LoaderCircle size={15} className="spin" />
            ) : (
              <>
                Sign in
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>
      </section>
    </main>
  );
}
