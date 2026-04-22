type SupabaseError = {
  message: string;
};

type QueryResult<T> = {
  data: T | null;
  error: SupabaseError | null;
};

type MutationType = "insert" | "upsert" | "delete" | null;

type AuthUser = {
  id: string;
  email?: string;
};

type SupabaseAuthClient = {
  signInWithOtp: (payload: {
    email: string;
    options?: { emailRedirectTo?: string };
  }) => Promise<{ data: null; error: SupabaseError | null }>;
  getUser: () => Promise<{ data: { user: AuthUser | null }; error: SupabaseError | null }>;
};

function getAccessTokenFromBrowserCookie() {
  if (typeof document === "undefined") return undefined;

  const tokenCookie = document.cookie
    .split(";")
    .map((entry) => entry.trim())
    .find((entry) => entry.startsWith("sb-access-token="));

  if (!tokenCookie) return undefined;
  return decodeURIComponent(tokenCookie.split("=").slice(1).join("="));
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

class SupabaseClient {
  auth: SupabaseAuthClient;

  constructor(
    private readonly baseUrl: string,
    private readonly anonKey: string,
    private readonly isConfigured: boolean,
    private readonly accessToken?: string,
  ) {
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

          if (!response.ok) {
            const body = (await response.json()) as { msg?: string; error_description?: string };
            return {
              data: null,
              error: { message: body.error_description ?? body.msg ?? `Auth request failed (${response.status})` },
            };
          }

          return { data: null, error: null };
        } catch (error) {
          return {
            data: null,
            error: { message: error instanceof Error ? error.message : "Magic Link konnte nicht gesendet werden." },
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const isSupabaseConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export function createClient(options?: { accessToken?: string }) {
  return new SupabaseClient(supabaseUrl ?? "", supabaseAnonKey ?? "", isSupabaseConfigured, options?.accessToken);
}

export const supabase = createClient();