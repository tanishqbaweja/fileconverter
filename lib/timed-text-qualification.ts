import type { SourceStreamInspection } from "./media-source-inspection";

export const TIMED_TEXT_QUALIFICATION_INPUTS = ["mp4", "mov", "3gp"] as const;
export const TIMED_TEXT_QUALIFICATION_PROFILES = TIMED_TEXT_QUALIFICATION_INPUTS.map(input => `${input}-to-vtt`);

export function isTimedTextQualification(profileId?: string | null): boolean {
  return !!profileId && TIMED_TEXT_QUALIFICATION_PROFILES.includes(profileId);
}

export function isTimedTextTrackId(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value > 0 && value <= 0xffffffff;
}

export function requirePrivateTimedTextSelection(hostname: string, value: unknown, destinationMode: string): number {
  if (!["127.0.0.1", "localhost", "[::1]"].includes(hostname)) {
    throw new Error("Timed-text WebVTT extraction is restricted to local qualification.");
  }
  if (destinationMode !== "handle" && destinationMode !== "opfs-test") {
    throw new Error("Timed-text qualification requires a direct or owned local test destination.");
  }
  if (!isTimedTextTrackId(value)) throw new Error("Choose an explicit MPEG-4 Timed Text track.");
  return value;
}

export function timedTextTrackChoices(streams: readonly SourceStreamInspection[]) {
  const ids = new Map<number, number>();
  for (const { isoTrackId } of streams) {
    if (isTimedTextTrackId(isoTrackId)) ids.set(isoTrackId, (ids.get(isoTrackId) ?? 0) + 1);
  }
  return streams.flatMap((stream, index) => {
    const id = stream.isoTrackId;
    if (stream.mediaType !== "subtitle" || stream.isoSubtitleSampleEntry !== "tx3g" ||
        !isTimedTextTrackId(id) || ids.get(id) !== 1) return [];
    return [{ id, label: `Stream ${index + 1} · track ${id}${stream.languageTag ? ` · ${stream.languageTag}` : ""}` }];
  });
}
