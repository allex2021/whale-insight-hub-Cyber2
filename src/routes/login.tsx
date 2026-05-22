import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, type FormEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export const Route = createFileRoute("/login")({
  head: () => ({ meta: [{ title: "Sign in · Whale Intelligence Pro" }] }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null); setBusy(true);
    try {
      if (mode === "signup") {
        const { error } = await supabase.auth.signUp({
          email, password,
          options: { emailRedirectTo: window.location.origin },
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
      navigate({ to: "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const onGoogle = async () => {
    setError(null); setBusy(true);
    try {
      const result = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
      if (result.error) throw result.error;
      if (result.redirected) return;
      navigate({ to: "/" });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-background text-foreground">
      <div className="w-full max-w-md rounded-xl border border-border bg-card/60 p-6 backdrop-blur-xl">
        <div className="flex items-center gap-3 mb-6">
          <div className="grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br from-[var(--neon-purple)] to-[var(--neon-blue)]">
            <span className="text-xl">🐋</span>
          </div>
          <div>
            <h1 className="text-base font-bold">Whale Intelligence Pro</h1>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Powered by Allex@Cyber2</p>
          </div>
        </div>

        <h2 className="text-xl font-semibold mb-1">{mode === "signin" ? "Sign in" : "Create account"}</h2>
        <p className="text-xs text-muted-foreground mb-4">
          {mode === "signin" ? "Welcome back, trader." : "Get your personalised whale alerts."}
        </p>

        <button
          onClick={onGoogle}
          disabled={busy}
          className="w-full mb-4 flex items-center justify-center gap-2 rounded-md border border-border bg-secondary px-4 py-2 text-sm font-semibold hover:border-border-bright disabled:opacity-50"
        >
          <svg className="h-4 w-4" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
          </svg>
          Continue with Google
        </button>

        <div className="relative my-4">
          <div className="border-t border-border" />
          <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-card px-2 text-[10px] uppercase text-muted-foreground">or</span>
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block">
            <span className="text-[10px] uppercase text-muted-foreground">Email</span>
            <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm" />
          </label>
          <label className="block">
            <span className="text-[10px] uppercase text-muted-foreground">Password</span>
            <input type="password" required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm" />
          </label>

          {error && <div className="rounded-md border border-bear/40 bg-bear/10 p-2 text-xs text-bear">{error}</div>}

          <button type="submit" disabled={busy}
            className="w-full rounded-md bg-gradient-to-r from-[var(--neon-purple)] to-[var(--neon-blue)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
            {busy ? "Please wait…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>

        <div className="mt-4 text-center text-xs text-muted-foreground">
          {mode === "signin" ? (
            <>No account? <button onClick={() => setMode("signup")} className="text-[var(--neon-blue)] hover:underline">Sign up</button></>
          ) : (
            <>Already a member? <button onClick={() => setMode("signin")} className="text-[var(--neon-blue)] hover:underline">Sign in</button></>
          )}
        </div>
        <div className="mt-4 text-center">
          <Link to="/" className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">← Back</Link>
        </div>
      </div>
    </div>
  );
}
