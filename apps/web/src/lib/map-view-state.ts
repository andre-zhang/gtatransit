const STORAGE_KEY = "gta-map-view";

export type SavedMapView = {
  center: [number, number];
  zoom: number;
};

export function readSavedMapView(): SavedMapView | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SavedMapView;
    if (
      !Array.isArray(data.center) ||
      data.center.length !== 2 ||
      typeof data.zoom !== "number" ||
      !Number.isFinite(data.center[0]) ||
      !Number.isFinite(data.center[1]) ||
      !Number.isFinite(data.zoom) ||
      Math.abs(data.center[1]) > 90 ||
      Math.abs(data.center[0]) > 180 ||
      data.zoom < 0 ||
      data.zoom > 22
    ) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

export function saveMapView(center: [number, number], zoom: number) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ center, zoom }));
  } catch {
    /* quota / private mode */
  }
}
