import { normalizeSupabaseProjectUrl } from "@/lib/supabase-env";

const supabaseUrl = normalizeSupabaseProjectUrl(process.env.NEXT_PUBLIC_SUPABASE_URL);
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export type ExchangedSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

export async function verifyTokenHash(tokenHash: string, type: string): Promise<ExchangedSession | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const verifyResponse = await fetch(`${supabaseUrl}/auth/v1/verify`, {
    method: "POST",
    headers: {
      apikey: supabaseAnonKey,
      Authorization: `Bearer ${supabaseAnonKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token_hash: tokenHash, type }),
    cache: "no-store",
  });

  if (!verifyResponse.ok) return null;
  const session = (await verifyResponse.json()) as ExchangedSession;
  if (!session.access_token || !session.refresh_token) return null;
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_in: session.expires_in ?? 3600,
  };
}

export async function exchangeAuthCode(code: string): Promise<ExchangedSession | null> {
  if (!supabaseUrl || !supabaseAnonKey) return null;

  const attempt = async (grantType: "pkce" | "authorization_code") => {
    const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=${grantType}`, {
      method: "POST",
      headers: {
        apikey: supabaseAnonKey,
        Authorization: `Bearer ${supabaseAnonKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ auth_code: code }),
      cache: "no-store",
    });

    if (!response.ok) return null;
    return (await response.json()) as ExchangedSession;
  };

  const pkce = await attempt("pkce");
  if (pkce?.access_token && pkce.refresh_token) return pkce;
  return attempt("authorization_code");
}
