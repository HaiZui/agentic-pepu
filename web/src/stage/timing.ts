/** Reading-time constants published by /api/catalog (checked against the backend by timing.test.ts). */
export const READING_BASE_SECONDS = 1.2;
export const READING_PER_CHAR_SECONDS = 0.055;

export function readingSeconds(text: string): number {
  return READING_BASE_SECONDS + READING_PER_CHAR_SECONDS * [...text].length;
}

/** Fixed staging costs at 1x, in seconds. */
export const DURATION = {
  curtain: 3,
  seal: 4.5,
  oldKing: 3.5,
  rollCallBase: 1.8,
  /** Small rosters get a longer look at each newcomer; large ones keep the roll call brisk. */
  rollCallMember: (groupSize: number, rosterSize: number) => Math.max(0.45, Math.min(1.6, 12 / rosterSize)) * groupSize,
  titleCard: 4.5,
  sceneryChange: 2.2,
  enter: 1.6,
  /** Closing hold that absorbs leftover beat budget. */
  tableauMax: 5,
  fall: 2.2,
  exit: 1.8,
  montageBase: 1.6,
  montagePerVictim: 1.3,
  panelBreakBase: 2.4,
  panelBreakPerPanel: 1.9,
  coronation: 9,
  creditsBase: 16,
  creditsPerParticipant: 0.3,
} as const;

/**
 * Lines may be held longer than their reading time so a short scene still fills its beat budget,
 * but never longer than this multiple of the reading time.
 */
export const MAX_STRETCH = 2.6;

/** When things happen inside a step, in show seconds (1x); shared by the renderer and the audio. */
export const MOMENT = {
  bubble: 0.15,
  /** First onomatopoeia of a line; later ones follow every `soundGap` seconds. */
  sound: 0.55,
  soundGap: 0.5,
  curtainOpens: 0.5,
  rollCallBanner: 0.3,
  actionStart: 0.1,
  rodSnap: 0.4,
  coronationName: 1.7,
} as const;

/** Moments the montage's red X stamps land (after a 0.25 s drop), one per victim. */
export function montageStamps(duration: number, count: number): number[] {
  const per = (duration - 1.2) / Math.max(count, 1);
  return Array.from({ length: count }, (_, i) => 0.3 + i * per + per * 0.5 + 0.25);
}
