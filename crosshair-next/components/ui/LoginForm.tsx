"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const rawNext = params.get("next") ?? "/finder";
  // Only same-site relative paths, never an open redirect.
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/finder";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(params.get("error"));
  const [notice, setNotice] = useState<string | null>(null);
  const [needsConfirm, setNeedsConfirm] = useState(false);

  async function resend() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const { error: err } = await supabase.auth.resend({
        type: "signup",
        email,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
        },
      });
      if (err) throw err;
      setNeedsConfirm(false);
      setNotice("Confirmation email sent. Open the link in this browser within a few minutes.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not resend");
    } finally {
      setBusy(false);
    }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    setNeedsConfirm(false);
    try {
      const supabase = createClient();
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
          },
        });
        if (err) throw err;
        if (data.session) {
          // Email confirmation is off for this project: signed in already.
          router.push(next);
          router.refresh();
          return;
        }
        setNotice("Account created. Open the confirmation link we emailed you, then sign in.");
        setMode("signin");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) {
          if (/not confirmed/i.test(err.message)) setNeedsConfirm(true);
          throw err;
        }
        router.push(next);
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-5">
      <div className="ch-card w-full max-w-[400px] p-6">
        <h1
          className="text-2xl font-extrabold tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Crosshair
        </h1>
        <p className="mt-1 mb-5 text-sm" style={{ color: "var(--color-muted)" }}>
          {mode === "signin" ? "Sign in to your workspace." : "Create a workspace."}
        </p>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label htmlFor="email" className="mb-1 block text-[13px] font-semibold">
              Email
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="email"
              className="ch-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-[13px] font-semibold">
              Password
            </label>
            <input
              id="password"
              type="password"
              required
              minLength={8}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              className="ch-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          {error ? (
            <p
              className="rounded-[9px] px-3 py-2 text-sm"
              role="alert"
              style={{ background: "var(--color-coral-bg)", color: "var(--color-coral)" }}
            >
              {error}
            </p>
          ) : null}
          {needsConfirm ? (
            <button
              type="button"
              className="ch-btn w-full justify-center"
              disabled={busy || !email}
              onClick={() => void resend()}
            >
              Resend confirmation email
            </button>
          ) : null}
          {notice ? (
            <p
              className="rounded-[9px] px-3 py-2 text-sm"
              style={{ background: "var(--color-mint-bg)", color: "var(--color-mint)" }}
            >
              {notice}
            </p>
          ) : null}

          <button type="submit" className="ch-btn ch-btn-primary w-full justify-center" disabled={busy}>
            {busy ? "Working…" : mode === "signin" ? "Sign in" : "Create workspace"}
          </button>
        </form>

        <button
          type="button"
          className="mt-4 text-[13px] font-semibold"
          style={{ color: "var(--color-brand)" }}
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
          }}
        >
          {mode === "signin" ? "Need a workspace? Create one" : "Already have one? Sign in"}
        </button>
      </div>
    </div>
  );
}
