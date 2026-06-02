const GO_LINE_COLORS: Record<string, string> = {
  "01": "#e57200",
  "02": "#00843d",
  "03": "#ffd100",
  "04": "#0080c0",
  "05": "#0080c0",
  "06": "#8b008b",
  "07": "#c8102e",
  "08": "#0080c0",
  "09": "#8b4513",
  "10": "#6f2da8",
  "11": "#00843d",
  "12": "#0080c0",
  "13": "#00843d",
  "14": "#c8102e",
  "15": "#0080c0",
  "16": "#00843d",
  "17": "#0080c0",
  "18": "#00843d",
  "19": "#0080c0",
  "20": "#00843d",
  "21": "#0080c0",
  "22": "#00843d",
  "23": "#0080c0",
  "24": "#00843d",
  "25": "#0080c0",
  "26": "#00843d",
  "27": "#0080c0",
  "28": "#00843d",
  "29": "#0080c0",
  "30": "#00843d",
  "31": "#0080c0",
  "32": "#00843d",
};

export const AGENCY_COLORS: Record<string, string> = {
  ttc: "#da291c",
  go: "#007934",
  yrt: "#0072ce",
  brampton: "#e87722",
  drt: "#003da5",
  miway: "#00a651",
};

export function routeColor(
  feedId: string,
  routeShortName: string | null,
  routeColor: string | null,
): string {
  if (routeColor) return `#${routeColor.replace(/^#/, "")}`;
  if (feedId === "go" && routeShortName) {
    const c = GO_LINE_COLORS[routeShortName.padStart(2, "0")];
    if (c) return c;
  }
  return AGENCY_COLORS[feedId] ?? "#007934";
}

export const MODE_LABELS: Record<number, string> = {
  0: "Tram",
  1: "Subway",
  2: "Rail",
  3: "Bus",
  4: "Ferry",
};
