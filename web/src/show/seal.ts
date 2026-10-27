/** First 12 hex characters in groups of four, as shown on stage. */
export function shortSeal(seal: string): string {
  return (seal.slice(0, 12).match(/.{1,4}/g) ?? []).join(" ");
}
