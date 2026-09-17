export default function AppRouteSkeleton({ label = "Inhalte werden vorbereitet" }: { label?: string }) {
  return (
    <main className="app-container" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      <div className="route-skeleton" aria-hidden>
        <header className="route-skeleton__header">
          <span className="route-skeleton__line route-skeleton__line--eyebrow" />
          <span className="route-skeleton__line route-skeleton__line--title" />
          <span className="route-skeleton__line route-skeleton__line--subtitle" />
        </header>
        <section className="route-skeleton__card">
          <span className="route-skeleton__line route-skeleton__line--section" />
          <div className="route-skeleton__grid">
            <span />
            <span />
            <span />
          </div>
        </section>
        <section className="route-skeleton__card route-skeleton__card--large">
          <span className="route-skeleton__line route-skeleton__line--section" />
          <span className="route-skeleton__block" />
        </section>
      </div>
    </main>
  );
}
