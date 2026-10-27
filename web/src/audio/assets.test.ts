// @vitest-environment happy-dom
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import openapi from "../api/openapi.json";
import { CastSheet } from "../stage/cast";
import { FIXTURES } from "../stage/fixtures";
import { Overlays } from "../stage/overlays";
import { AudioEngine } from "./engine";
import { FakeContext } from "./fake-context";
import { attributionLines, loadSounds, type LicenseEntry } from "./loader";
import { CUES, MOODS, REQUIRED_STEMS, STINGERS } from "./schedule";

const AUDIO_DIR = join(dirname(fileURLToPath(import.meta.url)), "../../public/audio");
const manifest = JSON.parse(readFileSync(join(AUDIO_DIR, "LICENSES.json"), "utf-8")) as LicenseEntry[];
const REDISTRIBUTABLE = new Set(["CC0-1.0", "CC-BY-3.0", "CC-BY-4.0", "Pixabay"]);

function filesUnder(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? filesUnder(path) : [relative(AUDIO_DIR, path).replace(/\\/g, "/")];
  });
}

const schemas = (openapi as unknown as { components: { schemas: Record<string, { properties: Record<string, { items: { enum: string[] } }> }> } })
  .components.schemas;

describe("bundled audio assets", () => {
  it("match the published mood and cue catalogs", () => {
    expect([...MOODS]).toEqual(schemas.Catalog.properties.music_moods.items.enum);
    expect([...CUES]).toEqual(schemas.Catalog.properties.sfx_cues.items.enum);
  });

  it("have an Ogg and an MP3 file for every mood, cue and stinger", () => {
    expect(REQUIRED_STEMS).toHaveLength(MOODS.length + CUES.length + STINGERS.length);
    for (const stem of REQUIRED_STEMS) {
      for (const ext of ["ogg", "mp3"]) expect(existsSync(join(AUDIO_DIR, `${stem}.${ext}`)), `${stem}.${ext}`).toBe(true);
    }
  });

  it("list every file in LICENSES.json with a redistributable licence, and nothing that is not there", () => {
    const files = filesUnder(AUDIO_DIR).filter((f) => f !== "LICENSES.json").sort();
    expect(manifest.map((e) => e.file).sort()).toEqual(files);
    for (const entry of manifest) {
      expect(REDISTRIBUTABLE.has(entry.license), `${entry.file}: ${entry.license}`).toBe(true);
      expect(entry.title && entry.author).toBeTruthy();
      if (entry.attribution_required) expect(entry.attribution_text).not.toBe("");
    }
  });
});

describe("loading and attribution", () => {
  const response = (body: string, type: string, ok = true) =>
    ({ ok, headers: new Headers({ "content-type": type }), arrayBuffer: async () => new TextEncoder().encode(body).buffer }) as Response;

  it("falls back to MP3, and reports files the server does not really have", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchFake = (async (url: string) => {
      if (url.endsWith("raven.ogg") || url.endsWith("raven.mp3")) return response("<html>", "text/html");
      if (url.endsWith("gong.ogg")) return response("bad", "audio/ogg");
      return response("ok", url.endsWith(".mp3") ? "audio/mpeg" : "audio/ogg");
    }) as typeof fetch;
    const engine = new AudioEngine(new FakeContext());
    const report = await loadSounds(engine, ["sfx/raven", "sfx/gong", "music/feast"], fetchFake);
    expect(report.missing).toEqual(["sfx/raven"]);
    expect(report.loaded.sort()).toEqual(["music/feast", "sfx/gong"]);
    expect(engine.has("sfx/gong")).toBe(true);
  });

  it("puts a CC-BY attribution into the credits", () => {
    const entry: LicenseEntry = {
      file: "sfx/raven.ogg",
      title: "Raven",
      author: "A. Recordist",
      source_url: "https://example.org/raven",
      license: "CC-BY-4.0",
      attribution_required: true,
      attribution_text: "\"Raven\" by A. Recordist, CC BY 4.0",
    };
    const lines = attributionLines([...manifest, entry, { ...entry, file: "sfx/raven.mp3" }]);
    expect(lines).toEqual([entry.attribution_text]);

    const fate = FIXTURES[6].fate;
    const layer = document.createElement("div");
    const overlays = new Overlays(layer, fate, new CastSheet(fate), { bible: null, chronicle: null, reveal: async () => null, attributions: lines });
    overlays.apply({ seal: false, rollHouse: undefined, credits: true });
    expect(layer.querySelector("[data-testid=audio-credits]")?.textContent).toContain("A. Recordist, CC BY 4.0");
  });

  it("shows no audio credit line when nothing needs attribution", () => {
    expect(attributionLines(manifest)).toEqual([]);
  });
});
