import { getSupabasePublicConfig } from "@/lib/supabase-env";

type SupabaseError = {
  message: string;
};

function parseAuthErrorBody(body: unknown, fallback: string): string {
  if (!body || typeof body !== "object") return fallback;
  const record = body as { msg?: string; error_description?: string; message?: string; error?: string };
  return record.error_description ?? record.msg ?? record.message ?? record.error ?? fallback;
}

async function parseAuthResponse(response: Response, fallback: string): Promise<SupabaseError | null> {
  if (response.ok) return null;
  const body = await response.json().catch(() => null);
  const message = parseAuthErrorBody(body, fallback);
  if (response.status === 404) {
    return {
      message:
        "Supabase Auth-URL nicht gefunden (404). Prüfe NEXT_PUBLIC_SUPABASE_URL: nur https://PROJEKT-REF.supabase.co — ohne /auth/v1 oder /rest/v1 am Ende.",
    };
  }
  if (response.status === 400 && message.toLowerCase().includes("invalid login credentials")) {
    return {
      message:
        "E-Mail oder Passwort falsch — oder E-Mail noch nicht bestätigt (Supabase: Confirm email).",
    };
  }
  if (response.status === 400 && message.toLowerCase().includes("invalid api key")) {
    return {
      message:
        "Ungültiger Supabase API-Key. In .env.local: NEXT_PUBLIC_SUPABASE_ANON_KEY = sb_publishable_… (nicht sb_secret_). URL muss zum gleichen Projekt passen.",
    };
  }
  return { message: `${message} (${response.status})` };
}

function sessionFromAuthPayload(payload: unknown): AuthSession | null {
  if (!payload || typeof payload !== "object") return null;
  const record = payload as AuthSession;
  if (!record.access_token || !record.refresh_token) return null;
  return {
    access_token: record.access_token,
    refresh_token: record.refresh_token,
    expires_in: record.expires_in ?? 3600,
  };
}

type QueryResult<T> = {
  data: T | null;
  error: SupabaseError | null;
};

type MutationType = "insert" | "upsert" | "delete" | null;

type AuthUser = {
  id: string;
  email?: string;
};

type AuthSession = {
  access_token: string;
  refresh_token: string;
  expires_in: number;
};

type SupabaseAuthClient = {
  signInWithOtp: (payload: {
    email: string;
    options?: { emailRedirectTo?: string };
  }) => Promise<{ data: null; error: SupabaseError | null }>;
  signInWithPassword: (payload: {
    email: string;
    password: string;
  }) => Promise<{ data: { session: AuthSession | null }; error: SupabaseError | null }>;
  signUpWithPassword: (payload: {
    email: string;
    password: string;
  }) => Promise<{ data: { session: AuthSession | null; needsEmailConfirmation?: boolean }; error: SupabaseError | null }>;
  resendSignupConfirmation: (payload: { email: string }) => Promise<{ error: SupabaseError | null }>;
  resetPasswordForEmail: (payload: {
    email: string;
    redirectTo?: string;
  }) => Promise<{ error: SupabaseError | null }>;
  verifyOtp: (payload: {
    email: string;
    token: string;
    type?: "email" | "signup" | "recovery" | "magiclink";
  }) => Promise<{ data: { session: AuthSession | null }; error: SupabaseError | null }>;
  getUser: () => Promise<{ data: { user: AuthUser | null }; error: SupabaseError | null }>;
};

function getAccessTokenFromBrowserCookie() {
  if (typeof document === "undefined") return undefined;

  return getCookieValue("sb-access-token");
}

function getRefreshTokenFromBrowserCookie() {
  if (typeof document === "undefined") return undefined;
  return getCookieValue("sb-refresh-token");
}

function getCookieValue(name: string) {
  const tokenCookie = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith(`${name}=`));

  if (!tokenCookie) return undefined;
  return decodeURIComponent(tokenCookie.split("=").slice(1).join("="));
}

function persistBrowserSessionCookies(_session: AuthSession) {
  // Session cookies are set HttpOnly by /api/auth/session — not readable/writable from JS.
}

async function fetchBrowserAuthUser(): Promise<AuthUser | null> {
  try {
    const response = await fetch("/api/auth/me", { cache: "no-store", credentials: "same-origin" });
    if (response.status === 401) return null;
    if (!response.ok) return null;
    const me = (await response.json()) as { id?: string; email?: string };
    if (!me.id) return null;
    return { id: me.id, email: me.email };
  } catch {
    return null;
  }
}

async function refreshBrowserSession(): Promise<boolean> {
  try {
    const response = await fetch("/api/auth/refresh", {
      method: "POST",
      credentials: "same-origin",
    });
    return response.ok;
  } catch {
    return false;
  }
}

class SupabaseQueryBuilder<T = Record<string, unknown>> implements PromiseLike<QueryResult<T[]>> {
  private readonly table: string;
  private readonly baseUrl: string;
  private readonly anonKey: string;
  private readonly accessToken?: string;
  private selectedColumns = "*";
  private filters: Array<{ column: string; value: unknown }> = [];
  private limitValue: number | null = null;
  private mutationType: MutationType = null;
  private mutationPayload: unknown = null;
  private onConflict: string | undefined;
  private shouldReturnRows = false;
  private readonly isConfigured: boolean;

  constructor(table: string, baseUrl: string, anonKey: string, isConfigured: boolean, accessToken?: string) {
    this.table = table;
    this.baseUrl = baseUrl;
    this.anonKey = anonKey;
    this.isConfigured = isConfigured;
    this.accessToken = accessToken;
  }

  select(columns = "*") {
    this.selectedColumns = columns;
    this.shouldReturnRows = true;
    return this as unknown as SupabaseQueryBuilder<T>;
  }

  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }

  limit(value: number) {
    this.limitValue = value;
    return this;
  }

  insert(payload: unknown) {
    this.mutationType = "insert";
    this.mutationPayload = payload;
    return this;
  }

  upsert(payload: unknown, options?: { onConflict?: string }) {
    this.mutationType = "upsert";
    this.mutationPayload = payload;
    this.onConflict = options?.onConflict;
    return this;
  }

  delete() {
    this.mutationType = "delete";
    this.mutationPayload = null;
    return this;
  }

  async single<R = T>(): Promise<QueryResult<R>> {
    const result = await this.execute<R[]>();
    if (result.error) {
      return { data: null, error: result.error };
    }

    const first = Array.isArray(result.data) ? result.data[0] ?? null : null;
    return { data: first as R | null, error: null };
  }

  async maybeSingle<R = T>(): Promise<QueryResult<R>> {
    return this.single<R>();
  }

  then<TResult1 = QueryResult<T[]>, TResult2 = never>(
    onfulfilled?: ((value: QueryResult<T[]>) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return this.execute<T[]>().then(onfulfilled, onrejected);
  }

  private buildUrl() {
    const url = new URL(`${this.baseUrl}/rest/v1/${this.table}`);

    if (this.shouldReturnRows || this.mutationType === null) {
      url.searchParams.set("select", this.selectedColumns || "*");
    }

    for (const filter of this.filters) {
      url.searchParams.set(filter.column, `eq.${String(filter.value)}`);
    }

    if (this.limitValue !== null) {
      url.searchParams.set("limit", String(this.limitValue));
    }

    if (this.onConflict) {
      url.searchParams.set("on_conflict", this.onConflict);
    }

    return url;
  }

  private async execute<R>(): Promise<QueryResult<R>> {
    if (!this.isConfigured) {
      return {
        data: null,
        error: {
          message: "Supabase ist nicht konfiguriert. Setze NEXT_PUBLIC_SUPABASE_URL und NEXT_PUBLIC_SUPABASE_ANON_KEY.",
        },
      };
    }

    const url = this.buildUrl();
    const method =
      this.mutationType === "insert"
        ? "POST"
        : this.mutationType === "upsert"
          ? "POST"
          : this.mutationType === "delete"
            ? "DELETE"
            : "GET";

    const bearerToken = this.accessToken ?? this.anonKey;

    const headers: HeadersInit = {
      apikey: this.anonKey,
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
    };

    if (this.shouldReturnRows && this.mutationType !== null) {
      headers.Prefer = this.mutationType === "upsert" ? "return=representation,resolution=merge-duplicates" : "return=representation";
    } else if (this.mutationType === "upsert") {
      headers.Prefer = "resolution=merge-duplicates";
    }

    try {
      const response = await fetch(url.toString(), {
        method,
        headers,
        body: this.mutationType && this.mutationType !== "delete" ? JSON.stringify(this.mutationPayload) : undefined,
        cache: "no-store",
      });

      if (!response.ok) {
        let message = `Supabase request failed (${response.status})`;
        try {
          const body = (await response.json()) as { message?: string };
          if (body?.message) message = body.message;
        } catch {
          // noop
        }
        return { data: null, error: { message } };
      }

      const text = await response.text();
      if (!text) {
        return { data: [] as unknown as R, error: null };
      }

      return { data: JSON.parse(text) as R, error: null };
    } catch (error) {
      return {
        data: null,
        error: {
          message: error instanceof Error ? error.message : "Unbekannter Supabase-Fehler",
        },
      };
    }
  }
}

type StorageUploadOptions = {
  contentType?: string;
  upsert?: boolean;
  cacheControl?: string;
};

type StorageError = { message: string };

class SupabaseStorageBucket {
  constructor(
    private readonly bucket: string,
    private readonly baseUrl: string,
    private readonly anonKey: string,
    private readonly isConfigured: boolean,
    private readonly accessTokenProvider: () => string | undefined,
  ) {}

  private bearer(): string {
    return this.accessTokenProvider() ?? this.anonKey;
  }

  async upload(path: string, body: Blob | ArrayBuffer | Uint8Array, options?: StorageUploadOptions): Promise<{ data: { path: string } | null; error: StorageError | null }> {
    if (!this.isConfigured) return { data: null, error: { message: "Supabase ist nicht konfiguriert." } };
    try {
      const headers: HeadersInit = {
        apikey: this.anonKey,
        Authorization: `Bearer ${this.bearer()}`,
        "Content-Type": options?.contentType ?? "application/octet-stream",
      };
      if (options?.cacheControl) headers["Cache-Control"] = `max-age=${options.cacheControl}`;
      if (options?.upsert) headers["x-upsert"] = "true";

      const response = await fetch(`${this.baseUrl}/storage/v1/object/${encodeURIComponent(this.bucket)}/${path}`, {
        method: "POST",
        headers,
        body: body as BodyInit,
        cache: "no-store",
      });
      if (!response.ok) {
        let message = `Storage upload failed (${response.status})`;
        try {
          const json = (await response.json()) as { message?: string; error?: string };
          if (json?.message) message = json.message;
          else if (json?.error) message = json.error;
        } catch {
          // noop
        }
        return { data: null, error: { message } };
      }
      return { data: { path }, error: null };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : "Unbekannter Storage-Fehler" } };
    }
  }

  async createSignedUrl(path: string, expiresInSeconds: number): Promise<{ data: { signedUrl: string } | null; error: StorageError | null }> {
    if (!this.isConfigured) return { data: null, error: { message: "Supabase ist nicht konfiguriert." } };
    try {
      const response = await fetch(`${this.baseUrl}/storage/v1/object/sign/${encodeURIComponent(this.bucket)}/${path}`, {
        method: "POST",
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${this.bearer()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ expiresIn: expiresInSeconds }),
        cache: "no-store",
      });
      if (!response.ok) {
        return { data: null, error: { message: `Signed URL failed (${response.status})` } };
      }
      const json = (await response.json()) as { signedURL?: string; signedUrl?: string };
      const relative = json.signedURL ?? json.signedUrl;
      if (!relative) return { data: null, error: { message: "Signed URL fehlt." } };
      const fullUrl = relative.startsWith("http") ? relative : `${this.baseUrl}/storage/v1${relative}`;
      return { data: { signedUrl: fullUrl }, error: null };
    } catch (err) {
      return { data: null, error: { message: err instanceof Error ? err.message : "Unbekannter Storage-Fehler" } };
    }
  }

  async remove(paths: string[]): Promise<{ error: StorageError | null }> {
    if (!this.isConfigured) return { error: { message: "Supabase ist nicht konfiguriert." } };
    try {
      const response = await fetch(`${this.baseUrl}/storage/v1/object/${encodeURIComponent(this.bucket)}`, {
        method: "DELETE",
        headers: {
          apikey: this.anonKey,
          Authorization: `Bearer ${this.bearer()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prefixes: paths }),
        cache: "no-store",
      });
      if (!response.ok) {
        return { error: { message: `Storage delete failed (${response.status})` } };
      }
      return { error: null };
    } catch (err) {
      return { error: { message: err instanceof Error ? err.message : "Unbekannter Storage-Fehler" } };
    }
  }
}

class SupabaseStorageClient {
  constructor(
    private readonly baseUrl: string,
    private readonly anonKey: string,
    private readonly isConfigured: boolean,
    private readonly accessTokenProvider: () => string | undefined,
  ) {}

  from(bucket: string) {
    return new SupabaseStorageBucket(bucket, this.baseUrl, this.anonKey, this.isConfigured, this.accessTokenProvider);
  }
}

class SupabaseClient {
  auth: SupabaseAuthClient;
  storage: SupabaseStorageClient;

  constructor(
    private readonly baseUrl: string,
    private readonly anonKey: string,
    private readonly isConfigured: boolean,
    private readonly accessToken?: string,
  ) {
    this.storage = new SupabaseStorageClient(baseUrl, anonKey, isConfigured, () => this.accessToken ?? getAccessTokenFromBrowserCookie());
    this.auth = {
      signInWithOtp: async ({ email, options }) => {
        if (!this.isConfigured) {
          return {
            data: null,
            error: { message: "Supabase ist nicht konfiguriert." },
          };
        }

        try {
          const response = await fetch(`${this.baseUrl}/auth/v1/otp`, {
            method: "POST",
            headers: {
              apikey: this.anonKey,
              Authorization: `Bearer ${this.anonKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email,
              create_user: true,
              options: {
                email_redirect_to: options?.emailRedirectTo,
              },
            }),
          });

          const error = await parseAuthResponse(response, "Auth request failed");
          if (error) return { data: null, error };

          return { data: null, error: null };
        } catch (error) {
          return {
            data: null,
            error: { message: error instanceof Error ? error.message : "OTP-Code konnte nicht gesendet werden." },
          };
        }
      },
      signInWithPassword: async ({ email, password }) => {
        if (!this.isConfigured) {
          return { data: { session: null }, error: { message: "Supabase ist nicht konfiguriert." } };
        }
        try {
          const response = await fetch(`${this.baseUrl}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: {
              apikey: this.anonKey,
              Authorization: `Bearer ${this.anonKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ email, password }),
            cache: "no-store",
          });
          const error = await parseAuthResponse(response, "Anmeldung fehlgeschlagen");
          if (error) return { data: { session: null }, error };
          const session = sessionFromAuthPayload(await response.json());
          if (!session) {
            return { data: { session: null }, error: { message: "Keine Session von Supabase erhalten." } };
          }
          return { data: { session }, error: null };
        } catch (error) {
          return {
            data: { session: null },
            error: { message: error instanceof Error ? error.message : "Anmeldung fehlgeschlagen." },
          };
        }
      },
      signUpWithPassword: async ({ email, password }) => {
        if (!this.isConfigured) {
          return { data: { session: null }, error: { message: "Supabase ist nicht konfiguriert." } };
        }
        const redirectTo =
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/dashboard")}`
            : undefined;
        try {
          const response = await fetch(`${this.baseUrl}/auth/v1/signup`, {
            method: "POST",
            headers: {
              apikey: this.anonKey,
              Authorization: `Bearer ${this.anonKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email,
              password,
              options: redirectTo ? { email_redirect_to: redirectTo } : undefined,
            }),
            cache: "no-store",
          });
          const error = await parseAuthResponse(response, "Registrierung fehlgeschlagen");
          if (error) return { data: { session: null }, error };
          const payload = (await response.json()) as {
            session?: AuthSession;
            access_token?: string;
            refresh_token?: string;
            user?: { email?: string };
          };
          const session = sessionFromAuthPayload(payload.session ?? payload);
          return {
            data: {
              session,
              needsEmailConfirmation: !session,
            },
            error: null,
          };
        } catch (error) {
          return {
            data: { session: null },
            error: { message: error instanceof Error ? error.message : "Registrierung fehlgeschlagen." },
          };
        }
      },
      resendSignupConfirmation: async ({ email }) => {
        if (!this.isConfigured) {
          return { error: { message: "Supabase ist nicht konfiguriert." } };
        }
        const redirectTo =
          typeof window !== "undefined"
            ? `${window.location.origin}/auth/confirm?next=${encodeURIComponent("/dashboard")}`
            : undefined;
        try {
          const response = await fetch(`${this.baseUrl}/auth/v1/resend`, {
            method: "POST",
            headers: {
              apikey: this.anonKey,
              Authorization: `Bearer ${this.anonKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email,
              type: "signup",
              options: redirectTo ? { email_redirect_to: redirectTo } : undefined,
            }),
            cache: "no-store",
          });
          const error = await parseAuthResponse(response, "E-Mail konnte nicht erneut gesendet werden");
          return { error };
        } catch (error) {
          return {
            error: {
              message: error instanceof Error ? error.message : "E-Mail konnte nicht erneut gesendet werden.",
            },
          };
        }
      },
      resetPasswordForEmail: async ({ email, redirectTo }) => {
        if (!this.isConfigured) {
          return { error: { message: "Supabase ist nicht konfiguriert." } };
        }
        try {
          const response = await fetch(`${this.baseUrl}/auth/v1/recover`, {
            method: "POST",
            headers: {
              apikey: this.anonKey,
              Authorization: `Bearer ${this.anonKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email,
              redirect_to: redirectTo,
            }),
            cache: "no-store",
          });
          const error = await parseAuthResponse(response, "Reset-Mail konnte nicht gesendet werden");
          return { error };
        } catch (error) {
          return {
            error: {
              message: error instanceof Error ? error.message : "Reset-Mail konnte nicht gesendet werden.",
            },
          };
        }
      },
      verifyOtp: async ({ email, token, type = "email" }) => {
        if (!this.isConfigured) {
          return {
            data: { session: null },
            error: { message: "Supabase ist nicht konfiguriert." },
          };
        }

        try {
          const response = await fetch(`${this.baseUrl}/auth/v1/verify`, {
            method: "POST",
            headers: {
              apikey: this.anonKey,
              Authorization: `Bearer ${this.anonKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              email,
              token,
              type,
            }),
            cache: "no-store",
          });

          if (!response.ok) {
            const body = await response.json().catch(() => null);
            return {
              data: { session: null },
              error: { message: parseAuthErrorBody(body, `OTP verify failed (${response.status})`) },
            };
          }

          const session = sessionFromAuthPayload(await response.json());
          if (!session) {
            return { data: { session: null }, error: { message: "Keine Session erhalten." } };
          }
          return { data: { session }, error: null };
        } catch (error) {
          return {
            data: { session: null },
            error: { message: error instanceof Error ? error.message : "Code konnte nicht verifiziert werden." },
          };
        }
      },
      getUser: async () => {
        if (!this.isConfigured) {
          return {
            data: { user: null },
            error: { message: "Supabase ist nicht konfiguriert." },
          };
        }

        if (typeof window !== "undefined" && !this.accessToken) {
          const browserUser = await fetchBrowserAuthUser();
          return { data: { user: browserUser }, error: null };
        }

        const bearerToken = this.accessToken ?? getAccessTokenFromBrowserCookie();

        if (!bearerToken) {
          return { data: { user: null }, error: null };
        }

        try {
          const response = await fetch(`${this.baseUrl}/auth/v1/user`, {
            headers: {
              apikey: this.anonKey,
              Authorization: `Bearer ${bearerToken}`,
            },
            cache: "no-store",
          });

          if (!response.ok) {
            if (response.status === 401 && typeof window !== "undefined") {
              const refreshed = await refreshBrowserSession();
              if (refreshed) {
                const browserUser = await fetchBrowserAuthUser();
                if (browserUser) return { data: { user: browserUser }, error: null };
              }
            }
            return { data: { user: null }, error: null };
          }

          const user = (await response.json()) as AuthUser;
          return { data: { user }, error: null };
        } catch {
          return { data: { user: null }, error: null };
        }
      },
    };
  }

  from<T = Record<string, unknown>>(table: string) {
    return new SupabaseQueryBuilder<T>(table, this.baseUrl, this.anonKey, this.isConfigured, this.accessToken ?? getAccessTokenFromBrowserCookie());
  }
}

const publicConfig = getSupabasePublicConfig();
const supabaseUrl = publicConfig.url;
const supabaseAnonKey = publicConfig.anonKey;
const isSupabaseConfigured = publicConfig.isValid;

export function getSupabaseConfigIssues() {
  return publicConfig.issues;
}

export function createClient(options?: { accessToken?: string }) {
  return new SupabaseClient(supabaseUrl, supabaseAnonKey, isSupabaseConfigured, options?.accessToken);
}

export const supabase = createClient();