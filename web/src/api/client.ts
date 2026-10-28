import type { components } from "./schema";

export type ShowRequest = components["schemas"]["ShowRequest"];
export type ShowSession = components["schemas"]["ShowSession"];
export type Health = components["schemas"]["Health"];
export type FateScript = components["schemas"]["FateScript"];
export type Beat = components["schemas"]["Beat"];
export type Character = components["schemas"]["Character"];
export type Reveal = components["schemas"]["Reveal"];
export type SceneScript = components["schemas"]["SceneScript"];
export type ShowBible = components["schemas"]["ShowBible"];
export type ChronicleTexts = components["schemas"]["ChronicleTexts"];
export type GenerationStatus = components["schemas"]["GenerationStatus"];
export type Catalog = components["schemas"]["Catalog"];
export type ComicInfo = components["schemas"]["ComicInfo"];
export type Storyline = components["schemas"]["Storyline"];

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly messages: string[],
  ) {
    super(messages.join(" "));
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (response.ok) return (await response.json()) as T;

  let messages = [`Request failed (${response.status}).`];
  try {
    const body = await response.json();
    if (Array.isArray(body.detail)) {
      messages = body.detail.map((d: { msg?: string }) => d.msg ?? String(d));
    } else if (typeof body.detail === "string") {
      messages = [body.detail];
    }
  } catch {
    // Non-JSON error body; keep the generic message.
  }
  throw new ApiError(response.status, messages);
}

export const getHealth = () => request<Health>("/api/health");

export const createShow = (body: ShowRequest) =>
  request<ShowSession>("/api/shows", { method: "POST", body: JSON.stringify(body) });

export const getShow = (id: string) => request<ShowSession>(`/api/shows/${encodeURIComponent(id)}`);

export const getFate = (id: string) => request<FateScript>(`/api/shows/${encodeURIComponent(id)}/fate`);

export const revealSeed = (id: string) =>
  request<Reveal>(`/api/shows/${encodeURIComponent(id)}/reveal`, { method: "POST" });

const showPath = (id: string) => `/api/shows/${encodeURIComponent(id)}`;

export const getScene = (id: string, beat: number) => request<SceneScript>(`${showPath(id)}/scenes/${beat}`);
export const getStoryline = (id: string) => request<Storyline>(`${showPath(id)}/storyline`);
export const getBible = (id: string) => request<ShowBible>(`${showPath(id)}/bible`);
export const getChronicleTexts = (id: string) => request<ChronicleTexts>(`${showPath(id)}/chronicle-texts`);
export const getStoryStatus = (id: string) => request<GenerationStatus>(`${showPath(id)}/story`);
export const getCatalog = () => request<Catalog>("/api/catalog");
export const storyEventsUrl = (id: string) => `${showPath(id)}/events`;
export const getComic = (id: string) => request<ComicInfo>(`${showPath(id)}/comic`);
export const comicPdfUrl = (id: string) => `${showPath(id)}/comic.pdf`;
export const retryComic = (id: string) => request<ComicInfo>(`${showPath(id)}/comic/retry`, { method: "POST" });
export async function revealComic(id: string): Promise<void> {
  const response = await fetch(`${showPath(id)}/comic/reveal`, { method: "POST" });
  if (!response.ok) throw new ApiError(response.status, [`Request failed (${response.status}).`]);
}
