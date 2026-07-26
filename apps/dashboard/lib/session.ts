// Single-user session — Week 2, Story 3 (FR-008). No auth library: a signed
// cookie verified against SESSION_SECRET. There is no user table; "session"
// here means "the operator typed the shared secret once."
import { createHmac, timingSafeEqual } from 'crypto';

export const SESSION_COOKIE = 'socialfte_session';

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET is not set');
  return s;
}

// The cookie never carries the raw secret — only an HMAC of a fixed label,
// keyed by SESSION_SECRET. Anyone with the cookie can prove they once knew
// the secret, without the cookie itself being usable to derive it.
export function makeSessionToken(): string {
  return createHmac('sha256', secret()).update('socialfte-session').digest('hex');
}

export function verifySessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const expected = makeSessionToken();
  const a = Buffer.from(token);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function verifyPassword(candidate: string): boolean {
  const a = Buffer.from(candidate);
  const b = Buffer.from(secret());
  return a.length === b.length && timingSafeEqual(a, b);
}
