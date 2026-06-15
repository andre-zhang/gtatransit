import { formatDelayLabel } from "@/lib/delay-label";

type Stop = {
  stop_id: string;
  name: string;
  scheduled: string;
  predicted?: string;
  delayMin?: number;
};

export function StopTimeline({ stops }: { stops: Stop[] }) {
  if (!stops.length) return null;

  return (
    <ul className="px-3 py-2 sm:px-5 sm:py-3">
      {stops.map((s, i) => {
        const isLast = i === stops.length - 1;
        const time = s.predicted ?? s.scheduled;
        return (
          <li key={`${s.stop_id}-${s.scheduled}-${i}`} className="relative flex gap-3 pb-3 last:pb-0">
            {!isLast && (
              <span
                className="absolute left-[5px] top-3 bottom-0 w-px bg-go-bg"
                aria-hidden
              />
            )}
            <span
              className={`relative z-[1] mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full border-2 ${
                i === 0 ? "border-go-green bg-go-green" : "border-go-slate bg-white"
              }`}
              aria-hidden
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="w-12 shrink-0 text-right text-base font-bold tabular-nums text-go-navy sm:w-14 sm:text-lg">
                  {time}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-go-navy sm:text-base">
                  {s.name}
                </span>
                {s.delayMin != null && s.delayMin !== 0 && (
                  <span
                    className={`go-badge shrink-0 whitespace-nowrap ${s.delayMin > 0 ? "go-badge--late" : "go-badge--early"}`}
                  >
                    {formatDelayLabel(s.delayMin)}
                  </span>
                )}
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
