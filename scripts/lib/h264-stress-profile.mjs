import assert from "node:assert/strict";

// Test profiles only, never public capabilities or mutable encoder settings.
export function h264StressProfile(name = "short", cpuEnabled = false) {
  assert.ok(["short", "startup-scaling"].includes(name), "Unknown H264 stress profile");
  assert.ok(!(name === "startup-scaling" && cpuEnabled), "Startup gate cannot use the CPU profiler or one-run shortcut");
  return Object.freeze({ name, durationSeconds: name === "startup-scaling" ? 600 : 60,
    requireStartupOverlap: name === "startup-scaling", reportLabel: name === "startup-scaling" ? "startup-scaling" : "720p" });
}

export function startupConversionOverlap(samples) {
  const active = samples.filter((s) => /^conversion-\d+$/.test(s.phase) && s.jobState === "running" &&
    Number.isFinite(s.browserAgeMs) && s.browserAgeMs >= 0);
  if (!active.length) return { observed: false, earliestBrowserAgeMs: null, latestBrowserAgeMs: null };
  const earliestBrowserAgeMs = Math.min(...active.map((s) => s.browserAgeMs));
  const latestBrowserAgeMs = Math.max(...active.map((s) => s.browserAgeMs));
  return { observed: earliestBrowserAgeMs < 120000 && latestBrowserAgeMs >= 190000,
    earliestBrowserAgeMs, latestBrowserAgeMs };
}
