import type { AudioEngine } from "./engine";
import { REQUIRED_STEMS } from "./schedule";

export const AUDIO_BASE = "/audio";
const FORMATS = ["ogg", "mp3"] as const;

export interface LicenseEntry {
  file: string;
  title: string;
  author: string;
  source_url: string;
  license: string;
  attribution_required: boolean;
  attribution_text: string;
}

export interface LoadReport {
  loaded: string[];
  /** Stems with no playable file (missing, not audio, or undecodable). */
  missing: string[];
}

export async function fetchManifest(fetchImpl: typeof fetch = fetch): Promise<LicenseEntry[]> {
  try {
    const response = await fetchImpl(`${AUDIO_BASE}/LICENSES.json`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return (await response.json()) as LicenseEntry[];
  } catch (error) {
    console.warn("Audio licence manifest could not be loaded", error);
    return [];
  }
}

/** Credits lines for every asset whose licence asks for attribution (deduplicated across formats). */
export function attributionLines(manifest: readonly LicenseEntry[]): string[] {
  return [...new Set(manifest.filter((e) => e.attribution_required && e.attribution_text).map((e) => e.attribution_text))];
}

/** Fetch a file and accept it only if the server really returned audio (dev servers answer 404s with the app). */
async function fetchAudio(url: string, fetchImpl: typeof fetch): Promise<ArrayBuffer | null> {
  try {
    const response = await fetchImpl(url);
    const type = response.headers.get("content-type") ?? "";
    if (!response.ok || type.startsWith("text/")) return null;
    return await response.arrayBuffer();
  } catch {
    return null;
  }
}

/** Decode every required sound, preferring Ogg Opus and falling back to MP3. Never throws. */
export async function loadSounds(engine: AudioEngine, stems: readonly string[] = REQUIRED_STEMS, fetchImpl: typeof fetch = fetch): Promise<LoadReport> {
  const report: LoadReport = { loaded: [], missing: [] };
  engine.loading = true;
  await Promise.all(
    stems.map(async (stem) => {
      for (const format of FORMATS) {
        const data = await fetchAudio(`${AUDIO_BASE}/${stem}.${format}`, fetchImpl);
        if (!data) continue;
        try {
          engine.addBuffer(stem, await engine.context.decodeAudioData(data));
          report.loaded.push(stem);
          return;
        } catch {
          // Try the next format.
        }
      }
      report.missing.push(stem);
      console.warn(`Audio "${stem}" is missing or cannot be decoded; the show continues without it`);
    }),
  );
  engine.loading = false;
  report.missing.sort();
  return report;
}
