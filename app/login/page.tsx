"use client";

import { FormEvent, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase";

const RATE_LIMIT_HINT = "Bitte warte ca. 60 Sekunden und versuche es dann erneut.";

export default function LoginPage() {
  const supabase = createClient();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const urlError = useMemo(() => {
    const code = searchParams.get("error_code");

    if (code === "otp_expired") {
      return "Der Magic-Link ist abgelaufen oder wurde bereits verwendet. Bitte fordere einen neuen Link an.";
    }

    if (code === "over_email_send_rate_limit") {
      return `Zu viele E-Mails in kurzer Zeit. ${RATE_LIMIT_HINT}`;
    }

    return null;
  }, [searchParams]);

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });

    if (error) {
      const friendly = error.message.toLowerCase().includes("rate limit")
        ? `Zu viele Versuche. ${RATE_LIMIT_HINT}`
        : error.message;
      setMessage(friendly);
    } else {
      setMessage("Magic Link wurde gesendet. Bitte öffne den neuesten Link in deiner E-Mail.");
    }

    setLoading(false);
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-black px-4 text-white">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-2xl border border-zinc-800 bg-zinc-900 p-6">
        <h1 className="text-2xl font-semibold">Login</h1>
        <p className="text-sm text-zinc-400">Melde dich per Magic Link an.</p>

        {urlError ? <p className="rounded-lg border border-red-700 bg-red-950/40 px-3 py-2 text-sm text-red-200">{urlError}</p> : null}

        <label className="block space-y-2">
          <span className="text-sm text-zinc-300">E-Mail</span>
          <input
            type="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            className="w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2 outline-none ring-green-500 focus:ring-2"
            placeholder="you@example.com"
          />
        </label>

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-xl bg-green-600 px-4 py-2 font-semibold text-white transition hover:bg-green-500 disabled:opacity-70"
        >
          {loading ? "Sending..." : "Send Magic Link"}
        </button>

        {message ? <p className="text-sm text-zinc-300">{message}</p> : null}
      </form>
    </main>
  );
}