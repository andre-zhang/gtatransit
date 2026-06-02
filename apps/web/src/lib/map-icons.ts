import type maplibregl from "maplibre-gl";

const VEHICLE_ARROW_ID = "vehicle-arrow";

/** Small chevron pointing north — rotated by GTFS bearing on the map. */
export function vehicleArrowImageData(): ImageData {
  const size = 32;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("canvas 2d unavailable");

  const cx = size / 2;
  ctx.clearRect(0, 0, size, size);
  ctx.fillStyle = "#1c2840";
  ctx.strokeStyle = "#78be20";
  ctx.lineWidth = 1.4;
  ctx.lineJoin = "round";
  ctx.beginPath();
  ctx.moveTo(cx, 5);
  ctx.lineTo(size - 7, size - 9);
  ctx.lineTo(cx + 3.5, size - 11);
  ctx.lineTo(cx + 3.5, size - 5);
  ctx.lineTo(cx - 3.5, size - 5);
  ctx.lineTo(cx - 3.5, size - 11);
  ctx.lineTo(7, size - 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  return ctx.getImageData(0, 0, size, size);
}

export function ensureVehicleArrowImage(map: maplibregl.Map) {
  if (map.hasImage(VEHICLE_ARROW_ID)) return;
  map.addImage(VEHICLE_ARROW_ID, vehicleArrowImageData(), { pixelRatio: 2 });
}

export const VEHICLE_ARROW_IMAGE_ID = VEHICLE_ARROW_ID;
