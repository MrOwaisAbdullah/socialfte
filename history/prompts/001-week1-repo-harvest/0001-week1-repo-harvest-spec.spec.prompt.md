---
id: 0001
title: Week 1 repo harvest spec
stage: spec
date: 2026-07-26
surface: agent
model: claude-sonnet-5
feature: 001-week1-repo-harvest
branch: 001-week1-repo-harvest
user: owais_abdullah
command: /sp.specify
labels: ["repo-harvest", "socialfte", "week1", "migration"]
links:
  spec: specs/001-week1-repo-harvest/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/001-week1-repo-harvest/spec.md
 - specs/001-week1-repo-harvest/checklists/requirements.md
tests:
 - none (specification stage; no code executed)
---

## Prompt

We are in Week 1 of the SocialFTE build. Read docs/repo-harvest.md section 2 (delete
list) and section 3 (keep list) before doing anything.

Do these steps in order. Confirm each step is complete before moving to the next.
Do not batch steps.

STEP 1 — Execute the delete list from docs/repo-harvest.md §2.
Before deleting remotion/src/shots/, open Remotion Studio and list the composition
names. I want to see them before they go.
After deleting, run `git status` and show me the full list of deleted files.

STEP 2 — Restructure into the target tree from docs/repo-harvest.md §6.
- Move remotion/ → packages/remotion/
- Move tools/ ffmpeg layer → tools/media/ (cutlib, render_cuts, verify_cut, bake,
  clean_voice, mix_sfx, mix_music, rnnoise models)
- Move tools/yt_upload.py → apps/worker/publishers/youtube.py (do not modify yet)
- Create empty directories: apps/dashboard/, apps/worker/
- Update imports in tools/media/*.py that broke from the move
After restructuring, run `python -c "import tools.media.cutlib"` and fix any import
errors before proceeding.

STEP 3 — Fix the requirements.txt per docs/repo-harvest.md §5.
Show me the diff before applying it. Ask me to confirm.

STEP 4 — Write the six identity files. Use my answers from PROMPT 0.

SOUL.md (repo root):
Write a SOUL.md for the agent whose name I gave you. Tone: direct, clean, no fluff.
The agent manages social media for a Pakistani furniture brand. It drafts, waits for
human approval, publishes. It never publishes without approval. It writes captions in
the brand's voice, not like an AI. Structure: Identity, How I work, What I will not do,
Communication style. Keep it under 400 words — every token here is burned on every
agent call.

IDENTITY.md (repo root):
Product name: SocialFTE. Version: 0.1.0. Author: Owais Abdullah.
Supported platforms: Facebook, Instagram, YouTube Shorts, TikTok (draft-only until
audited). Notification channels: Discord (active), WhatsApp (available), Telegram
(available, off by default — requires VPN in Pakistan). LLM gateway: OpenRouter.
Primary model: deepseek/deepseek-v4-flash. Vision model: google/gemini-2.5-flash.
Base repo: fork of hassancs91/claude-youtube-editor (MIT).

AGENTS.md (repo root):
Write the operating constitution. Sections:
- Before every job: what the agent reads (SOUL, BRAND, HEARTBEAT)
- Decision framework: draft → render → review → approved → publish
- What requires human approval: everything except story-format reposts
- What to do on failure: state = failed, notify channel immediately
- Token refresh rule: never publish if credentials.expires_at < now + 7 days
- Anti-repeat rules: no template repeat within 4 posts, no asset repeat within 10,
  caption cosine similarity < 0.85 against last 30
- Audit log rule: every action writes a row, no exceptions
Keep it under 600 words.

HEARTBEAT.md (repo root):
Write the cron checklist from docs/socialfte-spec-v2.md §9. Under 50 lines.

TOOLS.md (repo root):
Write a stub — active platforms and notification channel from my PROMPT 0 answers.
BOOTSTRAP will fill in the credential details. Mark all credential fields as [PENDING].

MEMORY.md (repo root):
Write an empty initial file. Sections: Top performers, Learnings, Last updated.
One line each: "None yet."

STEP 5 — Run /brand-setup skill.
Tell me to run it manually: "Run /brand-setup now. Come back when it has written
BRAND.md, remotion/src/brand.ts, and rendered a proof card you're happy with."
Wait for me to confirm before continuing.

STEP 6 — Update CLAUDE.md.
Make CLAUDE.md a symlink to AGENTS.md. If symlinks don't work on this OS, make
CLAUDE.md a one-liner: `<!-- See AGENTS.md -->` and copy AGENTS.md content there.

STEP 7 — Checkpoint.
Run these checks and show me the results:
[ ] git status shows a clean restructured tree matching docs/repo-harvest.md §6
[ ] python -c "import tools.media.cutlib; import tools.media.clean_voice" succeeds
[ ] SOUL.md, IDENTITY.md, AGENTS.md, HEARTBEAT.md, TOOLS.md, MEMORY.md all exist
[ ] BRAND.md exists (written by /brand-setup)
[ ] packages/remotion/src/brand.ts exists (written by /brand-setup)
[ ] requirements.txt updated
[ ] git commit -m "week1: strip, restructure, identity files"

If any check fails, fix it before telling me the checkpoint passed.

## Response snapshot

Recognized that `/sp.specify` writes a specification artifact (WHAT/WHY), not the
literal 7-step execution runbook the user pasted — the actual delete/move/commit work
belongs to a later `/sp.plan` → `/sp.tasks` → `/sp.implement` pass, still gated by the
same operator-confirmation-per-stage requirement. Verified the repo is a real git repo
with `.specify/` scaffolding, and that `docs/repo-harvest.md` and
`docs/socialfte-spec-v2.md` exist; read repo-harvest.md §2/§3/§6 and spec-v2 §9/§10 in
full before writing anything. Allocated branch `001-week1-repo-harvest` via
`create-new-feature.sh --number 1 --short-name week1-repo-harvest`. Wrote
`specs/001-week1-repo-harvest/spec.md` with 6 prioritized, independently-testable user
stories (review-then-delete; restructure+import fix; requirements diff approval;
six identity files; brand-setup handoff + CLAUDE.md de-duplication; checkpoint-gated
commit), 23 functional requirements, 4 key entities, 6 measurable success criteria, and
an Assumptions section. Ran the spec-quality checklist: everything passes except "no
NEEDS CLARIFICATION markers remain" — the agent's name, referenced as "given
previously" for SOUL.md, was not found anywhere in this session, the repo, or prior
history, so it is a genuine blocking gap for User Story 4 only (SOUL.md /
IDENTITY.md's name-bearing content), not for the spec as a whole. Surfaced that single
clarifying question to the operator instead of guessing a name. Operator answered: no
separate persona name, the agent is "SocialFTE." Updated spec.md (Clarifications,
FR-011, FR-017, Edge Cases, Assumptions, User Story 4 acceptance scenario) and the
requirements checklist to reflect the resolved answer — all 16 checklist items now pass.

## Outcome

- ✅ Impact: Feature branch and spec created for the Week 1 SocialFTE repo-harvest
  migration; scope boundary between "write the spec" and "execute the migration" made
  explicit to the operator.
- 🧪 Tests: none — specification stage, no code or destructive repo operations were run.
- 📁 Files: specs/001-week1-repo-harvest/spec.md (new),
  specs/001-week1-repo-harvest/checklists/requirements.md (new).
- 🔁 Next prompts: resolve the agent-name clarification, then `/sp.clarify` (optional,
  already effectively answered inline) → `/sp.plan` → `/sp.tasks` → `/sp.implement` to
  actually run the 7 gated stages.
- 🧠 Reflection: the request was phrased as an imperative runbook ("do these steps in
  order") rather than a WHAT/WHY feature description; translating it into
  scenario/requirement form without inventing HOW-level detail (exact commands) took
  deliberate restraint, since the source material already contained commands.

## Evaluation notes (flywheel)

- Failure modes observed: none during this run; the main risk avoided was silently
  executing destructive repo operations (delete/move/commit) under a spec-writing
  command, and inventing an agent name with no available source.
- Graders run and results (PASS/FAIL): spec-quality checklist — 16/16 items PASS after
  the agent-name clarification was resolved (started at 15/16).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): none pending for this stage; proceed to
  `/sp.plan`.
