import Link from "next/link";
import { isPlausibleDelayMin } from "@/lib/delay-label";
import { DepartureStatus } from "./DepartureStatus";
import { TimePair } from "./TimePair";

type Stop = {
  stop_id: string;
  name: string;
  scheduled: string;
  predicted?: string;
  delayMin?: number;
  groupId?: string;
  passed?: boolean;
  current?: boolean;
};

export function StopTimeline({ stops }: { stops: Stop[] }) {
  if (!stops.length) return null;

  return (
    <ul className="py-1">
      {stops.map((s, i) => {
        const isLast = i === stops.length - 1;
        const nameEl = s.groupId ? (
          <Link
            href={`/stop/${s.groupId}`}
            className="min-w-0 flex-1 truncate text-sm text-go-navy hover:text-go-green sm:text-base"
          >
            {s.name}
          </Link>
        ) : (
          <span className="min-w-0 flex-1 truncate text-sm text-go-navy sm:text-base">
            {s.name}
          </span>
        );
        return (
          <li
            key={`${s.stop_id}-${s.scheduled}-${i}`}
            className={`relative flex items-start gap-2 px-3 py-2.5 sm:gap-4 sm:px-5 sm:py-3 ${s.passed ? "opacity-70" : ""}`}
          >
            {!isLast && (
              <span
                className="absolute left-[1.375rem] top-5 bottom-0 w-px bg-go-bg sm:left-[1.625rem]"
                aria-hidden
              />
            )}
            <span
              className={`relative z-[1] mt-1.5 h-3 w-3 shrink-0 rounded-full border-2 sm:mt-2 sm:h-3.5 sm:w-3.5 ${
                s.current && !s.passed
                  ? "border-go-green bg-go-green"
                  : s.passed
                    ? "border-go-slate bg-go-bg"
                    : "border-go-slate bg-white"
              }`}
              aria-hidden
            />
            <span className="w-[5.5rem] shrink-0 sm:w-32">
              <TimePair
                scheduled={s.scheduled}
                predicted={s.predicted}
                size="md"
                showStruckWhenEqual={Boolean(s.predicted && s.passed)}
              />
            </span>
            {nameEl}
            {isPlausibleDelayMin(s.delayMin) && s.delayMin !== 0 && (
              <DepartureStatus realtime latenessMin={s.delayMin} compact />
            )}
          </li>
        );
      })}
    </ul>
  );
}
