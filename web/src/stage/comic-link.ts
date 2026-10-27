import { comicPdfUrl, getComic, retryComic, revealComic, type ComicInfo } from "../api/client";

const FINAL = new Set<ComicInfo["status"]>(["ready", "failed", "off"]);
const RETRY_POLL_MS = 1000;

/** The comic PDF status for the credits, with the presenter's Open / Show in folder / Retry actions. */
export class ComicLink {
  info: ComicInfo | null = null;
  private readonly listeners = new Set<() => void>();

  constructor(private readonly showId: string) {}

  update(info: ComicInfo): void {
    this.info = info;
    for (const listener of [...this.listeners]) listener();
  }

  /** Returns an unsubscribe function. */
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  get pdfUrl(): string {
    return comicPdfUrl(this.showId);
  }

  open(): void {
    window.open(this.pdfUrl, "_blank", "noopener");
  }

  reveal(): Promise<void> {
    return revealComic(this.showId);
  }

  async retry(): Promise<void> {
    this.update(await retryComic(this.showId));
    // The story stream has ended by now, so follow the new attempt by polling.
    while (this.info && !FINAL.has(this.info.status)) {
      await new Promise((resolve) => setTimeout(resolve, RETRY_POLL_MS));
      this.update(await getComic(this.showId));
    }
  }
}
