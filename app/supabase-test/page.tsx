import { supabase } from "@/lib/supabase";

export default async function SupabaseTestPage() {
  const { data, error } = await supabase.from("profiles").select("*").limit(5);

  return (
    <main className="min-h-screen bg-black text-white p-6">
      <div className="mx-auto max-w-md">
        <h1 className="text-2xl font-bold">Supabase Test</h1>

        {error ? (
          <div className="mt-4 rounded-2xl border border-red-500/40 bg-red-500/10 p-4 text-red-300">
            <p className="font-semibold">Fehler</p>
            <p className="mt-2 text-sm">{error.message}</p>
          </div>
        ) : (
          <div className="mt-4 rounded-2xl border border-green-500/40 bg-green-500/10 p-4 text-green-300">
            <p className="font-semibold">Supabase Verbindung erfolgreich</p>
            <pre className="mt-3 overflow-auto text-xs text-white">
              {JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </main>
  );
}