# Quickstart: Validating the Week 1 Repo Harvest

Run this after `/sp.implement` reports the migration done, to confirm it independently
rather than trusting the implementation's own summary. Each block maps to one user
story's acceptance scenarios in `spec.md`.

## 1. Strip (Story 1)

```bash
git status --short   # should show only the deletes in contracts/delete-list.sh
ls media/library/sfx media/library/music media/library/catalog.json   # must still exist
```

Confirm the deleted-composition list you were shown before deletion had 37 names in it
(36 under `example/` + `BrandProof` under `brand/`).

## 2. Restructure (Story 2)

```bash
test -d packages/remotion && test -d tools/media && test -f apps/worker/publishers/youtube.py
python -c "import tools.media.cutlib, tools.media.clean_voice, tools.media.render_cuts, tools.media.verify_cut"
diff <(git show HEAD~1:tools/yt_upload.py 2>/dev/null || cat /dev/null) apps/worker/publishers/youtube.py
```

The last line should show either no output (if the file truly wasn't touched) or only
the import-path fix from research.md Decision 7 leaking in — nothing else (FR-006:
unmodified logic).

## 3. Dependencies (Story 3)

```bash
git diff HEAD~1 -- requirements.txt   # should match contracts/requirements.diff exactly
```

## 4. Identity files (Story 4)

```bash
for f in SOUL.md IDENTITY.md AGENTS.md HEARTBEAT.md TOOLS.md MEMORY.md; do
  test -f "$f" && echo "present: $f" || echo "MISSING: $f"
done
wc -w SOUL.md AGENTS.md      # should be <= 400 and <= 600 respectively
wc -l HEARTBEAT.md           # should be <= 50
grep -c '\[PENDING\]' TOOLS.md   # should be > 0
```

Read `SOUL.md` and `AGENTS.md` on their own, with no other file open. If you can't
answer "what is this agent, and what will it never do" from those two files alone,
Story 4 isn't done — the whole point is that they're self-contained.

## 5. Brand + CLAUDE.md (Story 5)

```bash
test -f BRAND.md && test -f packages/remotion/src/brand.ts && test -f packages/remotion/src/fonts.ts
ls -l CLAUDE.md   # symlink -> AGENTS.md, OR a one-line "See AGENTS.md" file
```

If `CLAUDE.md` is a regular file, open it — it must not contain any operating rule
that isn't also in `AGENTS.md`. If it does, Story 5 isn't done (SC-005).

## 6. Checkpoint + commit (Story 6)

```bash
bash specs/001-week1-repo-harvest/contracts/checkpoint.sh
git log --oneline -3   # exactly one new commit for this migration
```
