import Link from "next/link";

export default function NotFound() {
  return (
    <main className="app-container flex min-h-[60vh] flex-col items-center justify-center text-center">
      <p className="section-eyebrow">404</p>
      <h1 className="page-title mt-1">Seite nicht gefunden</h1>
      <p className="page-subtitle mt-2 max-w-md">Diese Route existiert nicht oder wurde verschoben.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <Link href="/dashboard" className="btn btn-primary">
          Zum Dashboard
        </Link>
        <Link href="/training" className="btn btn-ghost">
          Training
        </Link>
      </div>
    </main>
  );
}
