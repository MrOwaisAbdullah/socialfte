// Formats each platform actually supports — mirrors apps/worker/jobs/compose_batch.py's
// PLATFORM_FORMATS. Used to decide which posts are safe to cross-publish onto
// another platform without re-rendering (matching format ~= matching aspect
// ratio for this app's template set).
export const PLATFORM_FORMATS: Record<string, string[]> = {
  facebook: ['image', 'video'],
  instagram: ['image', 'video'],
  youtube_shorts: ['short'],
  tiktok: ['video'],
};

export function isFormatCompatible(platform: string, format: string): boolean {
  return PLATFORM_FORMATS[platform]?.includes(format) ?? false;
}
