/** Live map/RT APIs stay dynamic; cap wall time so Fluid CPU doesn't run at maxDuration on every poll. */
export const dynamic = "force-dynamic";
export const maxDuration = 30;
