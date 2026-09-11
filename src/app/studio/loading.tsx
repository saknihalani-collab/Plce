/** The dashboard's shape while today's numbers are read. */
export default function StudioLoading() {
  return (
    <div className="max-w-5xl animate-pulse" aria-busy aria-label="Loading">
      <div className="h-3 w-32 rounded bg-stone-deep" />
      <div className="mt-3 h-9 w-64 rounded bg-stone-deep" />

      <div className="card mt-8 p-5">
        <div className="h-3 w-24 rounded bg-stone-deep" />
        <div className="mt-3 h-8 w-full rounded bg-stone" />
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((card) => (
          <div key={card} className="card p-4">
            <div className="h-3 w-20 rounded bg-stone-deep" />
            <div className="mt-3 h-7 w-16 rounded bg-stone" />
          </div>
        ))}
      </div>

      <div className="card mt-10 p-5">
        {[0, 1, 2].map((row) => (
          <div key={row} className="mb-4 flex gap-4 last:mb-0">
            <div className="h-4 w-16 shrink-0 rounded bg-stone-deep" />
            <div className="size-2 shrink-0 rounded-full bg-stone-deep" />
            <div className="flex-1">
              <div className="h-4 w-40 rounded bg-stone-deep" />
              <div className="mt-1.5 h-3 w-56 rounded bg-stone" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
