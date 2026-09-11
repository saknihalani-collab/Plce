/**
 * The schedule's shape, while its data arrives.
 *
 * Deliberately the shape rather than a spinner: an owner opening the
 * schedule already knows what they are about to see, and a skeleton that
 * matches the grid makes the wait feel like loading rather than like
 * nothing happening.
 */
export default function ScheduleLoading() {
  return (
    <div className="max-w-6xl animate-pulse" aria-busy aria-label="Loading schedule">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="h-3 w-16 rounded bg-stone-deep" />
          <div className="mt-3 h-9 w-48 rounded bg-stone-deep" />
          <div className="mt-2 h-4 w-32 rounded bg-stone" />
        </div>
        <div className="flex gap-2">
          <div className="h-9 w-28 rounded-[--radius-sm] bg-stone-deep" />
          <div className="h-9 w-36 rounded-[--radius-sm] bg-stone-deep" />
          <div className="h-9 w-32 rounded-[--radius-sm] bg-stone-deep" />
        </div>
      </div>

      <div className="card mt-10 overflow-hidden">
        <div className="grid grid-cols-[3.5rem_repeat(3,minmax(0,1fr))] border-b border-line">
          <div />
          {[0, 1, 2].map((column) => (
            <div key={column} className="border-l border-line px-3 py-3">
              <div className="h-4 w-24 rounded bg-stone-deep" />
              <div className="mt-2 h-3 w-20 rounded bg-stone" />
            </div>
          ))}
        </div>

        <div className="grid grid-cols-[3.5rem_repeat(3,minmax(0,1fr))]">
          <div className="h-[28rem]" />
          {[0, 1, 2].map((column) => (
            <div key={column} className="relative h-[28rem] border-l border-line">
              <div
                className="absolute inset-x-1 rounded-[--radius-xs] bg-stone"
                style={{ top: `${12 + column * 14}%`, height: '18%' }}
              />
              <div
                className="absolute inset-x-1 rounded-[--radius-xs] bg-stone"
                style={{ top: `${52 + column * 8}%`, height: '14%' }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
