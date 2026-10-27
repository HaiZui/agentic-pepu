import {
  getBible,
  getChronicleTexts,
  getScene,
  getStoryStatus,
  storyEventsUrl,
  type ChronicleTexts,
  type ComicInfo,
  type GenerationStatus,
  type SceneScript,
  type ShowBible,
} from "../api/client";

type BeatStatus = GenerationStatus["beats"][number];
const COMIC_FINAL = new Set<ComicInfo["status"]>(["ready", "failed", "off"]);

export interface FeedHandlers {
  scene(scene: SceneScript, status: BeatStatus): void;
  bible?(bible: ShowBible): void;
  chronicle?(texts: ChronicleTexts): void;
  progress?(statuses: BeatStatus[]): void;
  /** Comic PDF status; the stream stays open after the story completes until the comic is final. */
  comic?(info: ComicInfo): void;
}

/** Follows story generation over SSE and hands every scene to the stage as soon as it is ready. */
export function followShow(showId: string, handlers: FeedHandlers): () => void {
  let statuses: BeatStatus[] = [];
  const requested = new Set<number>();
  let closed = false;

  const load = async (index: number, status: BeatStatus) => {
    statuses[index] = status;
    handlers.progress?.([...statuses]);
    if (status === "pending" || requested.has(index)) return;
    requested.add(index);
    try {
      const scene = await getScene(showId, index);
      if (!closed) handlers.scene(scene, status);
    } catch {
      requested.delete(index);
    }
  };

  const onStatus = (status: GenerationStatus) => {
    statuses = [...status.beats];
    handlers.progress?.([...statuses]);
    status.beats.forEach((s, i) => void load(i, s));
    if (status.bible_ready && handlers.bible) void getBible(showId).then((b) => !closed && handlers.bible?.(b));
    if (status.chronicle_ready && handlers.chronicle) void getChronicleTexts(showId).then((c) => !closed && handlers.chronicle?.(c));
  };

  const source = new EventSource(storyEventsUrl(showId));
  const parse = <T>(event: Event) => JSON.parse((event as MessageEvent).data) as T;
  source.addEventListener("status", (event) => onStatus(parse<GenerationStatus>(event)));
  source.addEventListener("beat", (event) => {
    const data = parse<{ index: number; status: BeatStatus }>(event);
    void load(data.index, data.status);
  });
  source.addEventListener("bible", () => void getBible(showId).then((b) => !closed && handlers.bible?.(b)));
  source.addEventListener("chronicle", () => void getChronicleTexts(showId).then((c) => !closed && handlers.chronicle?.(c)));
  source.addEventListener("complete", () => {
    if (!handlers.comic) source.close();
    void getStoryStatus(showId).then((s) => !closed && onStatus(s));
  });
  source.addEventListener("comic", (event) => {
    const info = parse<ComicInfo>(event);
    if (COMIC_FINAL.has(info.status)) source.close();
    if (!closed) handlers.comic?.(info);
  });

  return () => {
    closed = true;
    source.close();
  };
}
