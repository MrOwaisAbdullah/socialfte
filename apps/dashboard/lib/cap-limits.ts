// Daily post caps — mirrors apps/worker/jobs/publish_due.py's `_check_platform_cap`
// shape and apps/worker/config.py's `CAP_*` defaults exactly. Read here (not
// reimplemented): both sides read the same CAP_* env vars, so a change to one
// config value changes the cap everywhere without touching two implementations.
const CAP_ENV_VARS: Record<string, string> = {
  facebook: 'CAP_FACEBOOK_PER_DAY',
  instagram: 'CAP_INSTAGRAM_PER_DAY',
  youtube_shorts: 'CAP_YOUTUBE_PER_DAY',
  tiktok: 'CAP_TIKTOK_PER_DAY',
};

const CAP_DEFAULTS: Record<string, number> = {
  CAP_FACEBOOK_PER_DAY: 2,
  CAP_INSTAGRAM_PER_DAY: 2,
  CAP_INSTAGRAM_STORIES_PER_DAY: 5,
  CAP_YOUTUBE_PER_DAY: 1,
  CAP_TIKTOK_PER_DAY: 3,
};

function readCapEnv(envVar: string): number {
  const raw = process.env[envVar];
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : CAP_DEFAULTS[envVar];
}

// Instagram stories have their own cap, same special case as publish_due.py.
export function getDailyCap(platform: string, format: string): number {
  if (platform === 'instagram' && format === 'story') {
    return readCapEnv('CAP_INSTAGRAM_STORIES_PER_DAY');
  }
  const envVar = CAP_ENV_VARS[platform];
  return envVar ? readCapEnv(envVar) : 2; // unknown platform — allow by default, same as publish_due.py
}
