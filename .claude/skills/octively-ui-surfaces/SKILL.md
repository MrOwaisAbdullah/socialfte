---
name: octively-ui-surfaces
description: Load before writing or editing ANY component, page, or style in this repo — covers identifying which of the four surfaces (marketing/dashboard/portal/affiliate) a file belongs to, which CSS custom properties and surface class (.marketing/.dashboard/.dashboard.light/.portal/.portal.dark) apply, the JetBrains Mono law (admin-only), the Sky-Teal-only accent rule (indigo #6366F1 banned), skeleton-loader and empty-state-CTA conventions, and where DESIGN.md's token names/hex values/font claims have drifted from the actual code. Trigger on symptoms like "what class do I put on this div", "what color var do I use here", "should this be JetBrains Mono", "which components/ folder does this go in", "the embed widget preview looks off from the real widget", or any UI work on octively.com / admin.octively.com / app.octively.com / affiliates.octively.com.
---

# Octively UI Surfaces

Four production surfaces share one repo, one `globals.css`, and one accent color, but each has
its own canvas, ink, and typography rules. Picking the wrong surface's tokens is the single most
common UI mistake in this codebase. This skill is the fast, verified 20% that prevents it. Full
authority is `DESIGN.md` at repo root (~1509 lines) — this skill tells you what to trust in it and
what to ignore because it has drifted.

Repo path has spaces — always `cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"` first or
quote the path in every command below.

## The four surfaces (verified against `proxy.ts`, `app/*/layout.tsx`, `app/globals.css`)

| Surface | Hostname | Routed to | Layout file | Surface class | Canvas `--bg` | Component folder | Token class prefix |
|---|---|---|---|---|---|---|---|
| Marketing | `octively.com` | `app/(marketing)` | `app/(marketing)/layout.tsx` (none exists — root `app/layout.tsx` is the only layout; pages set the class themselves) | `.marketing` (+ `.dark` optional) | `#FAFAF9` | `components/marketing/` | `mkt-*` (CSS classes, not vars — see below) |
| Dashboard | `admin.octively.com` | `app/(dashboard)` (proxy rewrites to `/dashboard`) | `app/(dashboard)/layout.tsx` | `.dashboard` (default) or `.dashboard.light` | `#0C0A09` (dark) / `#FAFAFA` (`.light`) | `components/dashboard/` | `adm-*` (rare; most dashboard code has no class prefix, just uses vars directly) |
| Portal | `app.octively.com` | `app/(portal)` (proxy rewrites to `/portal`) | `app/(portal)/layout.tsx` | `.portal` (default) or `.portal.dark` | `#FAFAFA` (light) / `#0F0F0F` (`.dark`) | `components/portal/` | `prt-*` (rare, same as dashboard) |
| Affiliate | `affiliates.octively.com` | `app/affiliate` (proxy rewrites to `/affiliate`) | `app/affiliate/layout.tsx` (session check only, no styling) | **verified reality below — read before assuming** | — | `components/affiliate/` | none dedicated |

`proxy.ts:6-8` defines all three non-marketing origins; `proxy.ts:45-61` is the affiliate rewrite
block. CLAUDE.md (root) still says "three surfaces" — that's documented drift, this table (four)
is current as of 2026-07-06.

### Affiliate surface — verified reality (DESIGN.md predates this surface entirely)

The affiliate surface has **no dedicated token prefix and no consistent surface class**:

- `app/affiliate/login/page.tsx:80` and `app/affiliate/signup/page.tsx:74` explicitly set
  `className="marketing"` on their wrapper — these two pages render with marketing tokens
  (cream-adjacent `.marketing` vars) and reuse `components/affiliate/AffiliateLandingPage.tsx`,
  which also sets `className="marketing"` (line 44).
- `app/affiliate/dashboard/layout.tsx:20-21` (the authenticated affiliate area — dashboard, coupon,
  payouts, referrals, settings) sets **no surface class at all**. It reads `var(--bg)` /
  `var(--ink)` directly with an inline `style={{ background: 'var(--bg)', color: 'var(--ink)' }}`.
  With no ancestor `.marketing`/`.dashboard`/`.portal` class on `<html>`, these variables are
  undefined at that scope and fall through to the CSS fallback baked into `app/globals.css:220-221`
  (`background-color: var(--bg, #0C0A09); color: var(--ink, #F5F0EB);`) — the **dashboard dark**
  fallback values, not marketing cream. This looks like an unintentional gap, not a deliberate
  design choice: verify current visual behavior before treating it as correct, and do not "fix" it
  without going through `octively-change-control` (UI behavior change).
- Practical rule: when touching `app/affiliate/**`, check whether the specific page/layout sets
  `className="marketing"`. If not, either add it explicitly or confirm with the owner whether the
  authenticated affiliate area should look like marketing (cream, likely intent) or dashboard-dark
  (current accidental fallback) before writing new UI there.

## Token discipline

**Read `app/globals.css` before writing colors.** It is 541 lines; the surface blocks are
`:root` (shared semantic colors, lines 59-78), `.marketing` (83-96), `.marketing.dark` (369-381),
`.dashboard` (101-119), `.dashboard.light` (124-143), `.portal` (148-168), `.portal.dark`
(173-193).

Every surface class defines the **same variable names** with surface-specific values — this is
what makes cross-surface component reuse dangerous: a component using `var(--surface-2)` renders
correctly on whichever surface class wraps it, silently, with no error if you nest it in the wrong
one.

Common vars every surface defines: `--bg`, `--surface`, `--surface-2`, `--surface-3`, `--ink`,
`--ink-muted`, `--ink-subtle`, `--hairline`, `--hairline-strong`, `--primary-text`. Dashboard and
portal additionally define `--surface-4`, `--success-text`, `--error-text`, `--warning-text`,
`--credit-text`. Portal additionally defines `--bg-soft`, `--surface-raised`, `--ink-secondary`,
`--ink-faint`. Shared (not surface-scoped, defined once in `:root`): `--of-primary` (`#0EA5E9`),
`--of-primary-hover`, `--of-primary-deep`, `--of-primary-soft`, `--of-success`, `--of-warning`,
`--of-error`, `--of-credit` and their `-dark` variants for use on dark surfaces.

**Rules:**
1. Never hardcode a hex value in a component. Use `var(--bg)`, `var(--of-primary)`, etc. If a
   color you need doesn't exist as a var, that's a signal to check `DESIGN.md`'s Color Usage Rules
   section or ask, not to inline a hex.
2. Never reference a var expecting a different surface's value than what your nearest ancestor
   class provides — e.g. don't assume `--surface-4` exists outside `.dashboard`/`.portal` (marketing
   doesn't define it).
3. The `mkt-*`/`adm-*`/`prt-*` prefixes you'll see in `globals.css` (e.g. `.mkt-grid-bg`,
   `.mkt-prob-card`, `.mkt-hamburger`) are **one-off component CSS classes for hover/animation/
   responsive behavior**, not a token-naming scheme for CSS variables. Don't confuse them with
   `DESIGN.md`'s narrative that implies `mkt-canvas`/`adm-canvas`/`prt-canvas` are variable names —
   in the actual code the variable is always the generic `--bg`, scoped by the surface class.

### DESIGN.md drift — verified, do not copy these into new code

`DESIGN.md` predates several renames and never got updated. Treat these specific claims in it as
stale (checked against code on 2026-07-06):

| DESIGN.md says | Actual code | Evidence |
|---|---|---|
| Product is "OwFlex", domain `owflex.com` | Product is Octively, domain `octively.com` | `proxy.ts`, `app/layout.tsx` metadata |
| Marketing canvas is cream `#F5F1EC` (DESIGN.md:807, 1489) | `.marketing { --bg: #FAFAF9; }` | `app/globals.css:84` |
| All three surfaces use font "Inter" (DESIGN.md:951,956,962) | `Plus Jakarta Sans` (sans), `Source Serif 4` (prose), `JetBrains Mono` (mono) — no Inter anywhere | `app/layout.tsx:2,9-29`, `app/globals.css:51-53` |
| Token names `adm-canvas`, `adm-surface-1..4`, `mkt-canvas`, `mkt-surface-1/2`, `prt-canvas`, `prt-canvas-soft` | Generic `--bg`/`--surface`/`--surface-2..4` scoped by surface class | `app/globals.css` surface blocks |
| Three subdomains total | Four — affiliate added later | `proxy.ts:45-61`, this skill's surface table |
| "No dark mode on marketing" (DESIGN.md:1488-1490) | `.marketing.dark` exists and is implemented via `useDarkMode` hook | `app/globals.css:369-381`, `components/marketing/useDarkMode.ts` |

Where this table conflicts with `DESIGN.md`, this table wins. Everything else in `DESIGN.md` not
listed here should still be assumed accurate until you spot-check it — the drift above is what was
found, not a certification that the rest is current.

## Typography

Fonts are self-hosted via `next/font/google` in the single root `app/layout.tsx:2,9-29` (there is
no per-surface `layout.tsx` for marketing — the root layout serves it directly):

- `--font-sans` → Plus Jakarta Sans (weights 400/500/600/700/800) — body/UI text, all surfaces.
- `--font-prose` → Source Serif 4 — long-form/editorial copy (blog, guides).
- `--font-mono` → JetBrains Mono (weights 400/500/600/700).

`app/globals.css:216-218` re-aliases the `next/font` CSS variables (`--font-jakarta` etc.) into
`--font-sans`/`--font-mono`/`--font-prose` on `<body>` so inline `style={{ fontFamily:
'var(--font-mono)' }}` resolves correctly anywhere in the tree.

**JetBrains Mono law (non-negotiable, admin dashboard ONLY):**
- Use it for: every metric number in stat cards, credit balance displays, token/usage counts,
  embed key / API key display, code blocks and embed-script snippets, model name badges.
- NEVER use it on `app.octively.com` (portal) — portal stat numbers are large bold sans
  (`DESIGN.md:930-931`: "Inter Bold" claim is stale on the font name, but the "no mono on portal"
  rule itself is correct and matches current code intent — verify any portal numeral styling you
  write does not reach for `var(--font-mono)`).
- NEVER use it on marketing body copy.
- Read `DESIGN.md` lines 948-1007 ("Typography — The Critical Rules" and "Color Usage Rules") for
  the full per-surface heading/weight/tracking rules before building a new heading component —
  this skill only carries the law that prevents the most common mistake (mono leaking onto portal).

## Color law

- **Sky-Teal `#0EA5E9`** (`var(--of-primary)`) is the sole accent across all four surfaces. It goes
  on: the primary button, active nav item (with `--of-primary-soft` background), focus rings,
  links, primary stat numbers on portal. It never goes on section/card backgrounds, and never more
  than once per viewport group as a filled button.
- **Indigo `#6366F1` is banned everywhere in this codebase.** It is the default accent of every
  AI-scaffolded UI kit; using it signals "unreviewed AI output" to anyone who's seen enough of
  them. If you catch yourself about to write `#6366F1`, `indigo-500`, or similar, stop and use
  `var(--of-primary)`.
- Semantic colors: success `#10B981` (dark-surface variant `#34D399`), warning `#F59E0B`
  (`#FCD34D`), error `#EF4444` (`#F87171`), credit `#10B981` (`#34D399`) — all defined once in
  `:root` (`app/globals.css:59-78`), consumed via `--success-text` / `--error-text` /
  `--warning-text` / `--credit-text` which are re-pointed per surface/theme. Never hardcode these
  hexes either — go through the `-text` var so dark/light swap automatically.
- Full narrative rules (what teal/emerald/red are and are not for) are in `DESIGN.md` lines
  969-1005 ("Color Usage Rules") — read it before designing a new badge or delta indicator.

## Component placement

- `components/marketing/` — mkt surface only. `components/dashboard/` — admin only.
  `components/portal/` — client portal only. `components/affiliate/` — affiliate surface only.
  `components/shared/` — genuinely cross-surface (e.g. `ClientDate.tsx`, `CopyButton.tsx`,
  `ThemeToggleButton.tsx`, `JsonLd.tsx`) — verified list via `ls components/shared`.
  `components/ui/` — unstyled shadcn/ui primitives (`button.tsx`, `dialog.tsx`, `table.tsx`, etc.) —
  style these by passing surface-scoped `className`/CSS vars at the call site, never bake a
  surface's colors into the primitive itself.
  `components/brand/` — the Octively mark/logo/loading-motion family (`OctivelyLogo`,
  `OctivelySpinner`, `OctivelyPulse`, etc.) shared across surfaces by design.
- No shadcn GUI configurator is used (project rule, CLAUDE.md) — shadcn primitives here are
  hand-written/hand-copied, not generated; check `components/ui/` for the existing set before
  adding a new primitive.
- Skeleton loaders, not spinners, for route-level loading: every surface has `loading.tsx` files
  using the `.oct-skeleton` shimmer utility (`app/globals.css:36-45`, keyframe `oct-shimmer`).
  Verified present at `app/(dashboard)/dashboard/{bots,bots/[id],clients,leads}/loading.tsx` and
  `app/(portal)/portal/{,conversations,leads}/loading.tsx`. When adding a new route with async
  data, add a matching `loading.tsx` using `.oct-skeleton`, not a spinner component.
- Empty states must always render a clear next-action CTA (project rule, CLAUDE.md) — don't ship a
  bare "No leads yet." with nothing to click.

## Dark mode implementation (two independent systems — do not conflate them)

`next-themes` IS listed in `package.json` (`"next-themes": "^0.4.6"`) but is never imported
anywhere in `app/`, `lib/`, or `components/` (verify with `grep -rln next-themes app lib components`
— zero hits). Treat it as dead weight, not as evidence of a different theming mechanism: theme
switching is hand-rolled and **differs by surface**:

1. **Dashboard + Portal** share `lib/theme.ts`: `Surface = 'dashboard' | 'portal'`, default theme
   `dashboard → dark`, `portal → light` (`lib/theme.ts:4-7`). `applyTheme(surface, theme)` strips
   all surface/theme classes from `<html>` and re-adds exactly one surface class + one theme class,
   persisting to `localStorage` key `` `octively-theme-${surface}` `` (`lib/theme.ts:23-29`). The
   dashboard toggle lives in `components/dashboard/DashboardShell.tsx:13,24` (`useTheme('dashboard')`
   applying `document.documentElement.classList.add('dashboard', theme)`). The portal's initial
   theme is set by an inline `<script>` in `app/(portal)/layout.tsx` reading `localStorage`
   key `octively-theme-portal` before paint (anti-flash pattern) — note this is a **different**
   naming shape (`octively-theme-portal`, hyphenated) than the shared helper's template-literal key
   (`octively-theme-${surface}` → also `octively-theme-portal` — they do agree, just verify if you
   ever add a third consumer of `lib/theme.ts` that the key format matches).
2. **Marketing** uses its own hook, `components/marketing/useDarkMode.ts`, with an unrelated
   `localStorage` key `octively-theme` (no surface suffix, `useDarkMode.ts:12`) and a
   `useLayoutEffect`-based anti-flash strategy. It does NOT go through `lib/theme.ts`.
3. **Affiliate** has no dark mode toggle at all (not found in `components/affiliate/` or
   `app/affiliate/`) — see the affiliate surface note above about which class (if any) it inherits.

Do not port `lib/theme.ts`'s `Surface` union to include `'marketing'` or `'affiliate'` without
checking both consumers above — they're independent by design, not an oversight to "fix" silently.

## Responsive & elevation quick rules

From `DESIGN.md` lines 1007-1054 (verify current pixel values in `app/globals.css:499-541` for
marketing's actual breakpoints — the 767px/479px breakpoints there are the enforced ones):

- **Elevation:** dashboard and marketing use surface-lift + hairline borders, no `box-shadow`
  ladders. Portal is the only surface where subtle card shadows are acceptable
  (`box-shadow: 0 1px 3px rgba(0,0,0,0.06)`-scale, per `DESIGN.md:1032-1033`).
- **Touch targets:** portal is mobile-first — 44px minimum on all interactive elements
  (`DESIGN.md:1050`). Dashboard assumes desktop developer use, 36px is acceptable. Marketing CTAs
  target 40px.
- **Marketing breakpoints implemented today:** `@media (max-width: 767px)` collapses nav to
  hamburger, grids to single/2-column, hides sidebar mockup elements
  (`app/globals.css:500-536`); `@media (max-width: 479px)` further collapses 4-col grids to 1
  (`app/globals.css:538-541`).

## Widget / embed UI — special case, DESIGN.md tokens do not apply

`embed/src/embed.js` is **vanilla JS with inline styles and `cssText`**, injected into the host
page via a `<style>` tag built from a JS string (`embed/src/embed.js:135,138`) plus direct
`element.style.*` and `style.cssText` assignments throughout (e.g. line 326 sets
`frm.style.cssText="...background:"+(dk?"#111827":"#fff")` — colors are hardcoded conditionals
inside the widget script, not CSS vars, because the widget runs on an arbitrary third-party host
page with no access to this app's `globals.css`). Do not try to make the widget consume
`var(--of-primary)` etc. — it is intentionally self-contained.

**Any edit to `embed/src/embed.js` requires `npm run build:embed` before `npm run build`** — the
live `/embed.js` route serves the compiled `embed/dist/embed.min.js`, not the source file (project
rule, CLAUDE.md — verified present in `package.json` scripts).

**`LiveBotPreview` must pixel-match the real widget.** It is a function defined inline inside
`components/dashboard/BotSettingsForm.tsx` (not a separate file — verified via
`grep -n "function LiveBotPreview" components/dashboard/BotSettingsForm.tsx`, found at line 1141,
consumer at line 1111). Commit `c0f3c34` (`fix(bot-preview): pixel-match LiveBotPreview with embed
widget layout and sizing`) is the concrete lesson: header padding/avatar size, message bubble
padding/radius, input height/border, trigger button size/glow, tooltip padding/radius, WhatsApp
strip padding all had to be hand-matched to the numbers actually in `embed/src/embed.js`. When you
change the widget's visual spec, re-check `LiveBotPreview` for the same numbers, and vice versa —
there is no shared source of truth between them, so drift is silent.

## Pre-UI-work checklist

1. **Identify the surface.** Which hostname/route is this for? Check the table above; when in
   doubt, `grep` the file's path against `proxy.ts`'s rewrite rules.
2. **Read that surface's layout file** (`app/(dashboard)/layout.tsx`, `app/(portal)/layout.tsx`,
   `app/affiliate/layout.tsx`, or confirm marketing pages set `className="marketing"` themselves —
   there is no marketing-specific layout file).
3. **Use only that surface's tokens** — vars resolve through the nearest ancestor surface class;
   never hardcode a hex, never assume a var from a different surface.
4. **Check the relevant `DESIGN.md` section** for typography/color/layout narrative — but cross-
   check any specific hex/token-name/font-name claim against this skill's drift table first.
5. **Skeleton loader + empty-state CTA** for any new async route or empty list.
6. **`npm run build`** must exit 0 before pushing (project-wide gate, not specific to UI — see
   `octively-change-control`). If you touched `embed/src/embed.js`, run `npm run build:embed` first.

## When NOT to use this skill

- General React/Next.js patterns (Suspense boundaries, `Promise.all`, server-cache, dynamic
  imports, barrel-import avoidance) — use `vercel-react-best-practices` and
  `building-nextjs-apps` instead; this skill only covers Octively-specific surface/token rules.
- Copy tone, em-dash/rupee-glyph rules, changelog/roadmap sync, ADR/spec/doc-of-record hygiene —
  use `octively-docs-and-copy`.
- Build/push/deploy gating mechanics, commit message rules, owner-approval gates — use
  `octively-change-control`.
- Debugging a CSP/proxy/subdomain routing failure (e.g. 404 only on one subdomain, CORS on
  navigation) — use `octively-debugging-playbook`.
- WHY a design decision was made, or its known weak points (e.g. why the embed widget still uses
  script injection instead of iframe sandboxing) — use `octively-architecture-contract`.

## Provenance and maintenance

Verified 2026-07-06 against the working tree at this commit lineage (`git log` HEAD `6a9b946`);
revised 2026-07-07 (corrected the next-themes claim: the package IS in `package.json` but unused).
Re-run these before trusting any fact above that may have drifted:

```bash
cd "/mnt/d/GIAIC/Real World Projects/Owflex Chatbot Saas"

# Surface count and routing rules (confirms 4 surfaces, exact rewrite logic)
cat proxy.ts

# Token values per surface (confirms hex values and var names haven't changed)
grep -n "^\.\(marketing\|dashboard\|portal\)" -A 15 app/globals.css

# Font stack (confirms Plus Jakarta Sans / Source Serif 4 / JetBrains Mono, not Inter)
grep -n "Plus_Jakarta_Sans\|Source_Serif_4\|JetBrains_Mono" app/layout.tsx

# Affiliate surface class behavior (confirms which pages set className="marketing" and which don't)
grep -rn 'className="marketing"' app/affiliate components/affiliate
grep -n "style={{ background" app/affiliate/dashboard/layout.tsx

# Dark mode key/consumer check (confirms lib/theme.ts vs useDarkMode.ts split still holds)
cat lib/theme.ts
grep -n "octively-theme" app components -r --include="*.ts" --include="*.tsx"

# Embed widget build pipeline (confirms build:embed still exists and what it does)
grep -n "build:embed" package.json

# LiveBotPreview location (confirms it's still inline in BotSettingsForm.tsx, not extracted)
grep -n "function LiveBotPreview" components/dashboard/BotSettingsForm.tsx

# DESIGN.md drift re-check — re-diff these specific lines against current code before relying on them
sed -n '795,1054p' DESIGN.md
```
