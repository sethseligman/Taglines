export function parseChallengeBackgroundUrl(
  artConfig: Record<string, unknown> | null
): string | null {
  if (!artConfig || typeof artConfig.backgroundUrl !== "string") return null;
  const url = artConfig.backgroundUrl.trim();
  return url.length > 0 ? url : null;
}
