# Pushing to the public GitHub repo

How `master` in this working copy relates to `github.com/mrowaisabdullah/socialfte`, and how
to push an update there. This is **not** a plain `git push` — the public repo intentionally
does not get the full local history or every locally-tracked directory.

## Why this isn't a plain push

The local `master` branch (and every `NNN-weekN-*` branch) has the full, real development
history — 19+ commits going back to the Speckit template's initial commit. That initial
commit accidentally included the full contents of `.claude/skills/` (719 files — this
project's installed Claude Code skills, not part of the SocialFTE product) before
`.gitignore` was set up to exclude it. `.gitignore` only stops *new* files from being
tracked — it does not retroactively remove already-committed content from history. So a
normal `git push` of `master` would still ship all 719 skill files to GitHub, buried in an
early commit, even though they don't show up in `git status` or `git ls-files` today.

`specs/` (Speckit per-week planning docs) and `docs/` (this directory) are currently tracked
normally and *would* push fine — they're excluded from the public repo for now by choice,
not because of a leak risk. Revisit that decision separately; it's not part of this
mechanism.

## The `github-push` branch

`github-push` is a local **orphan branch** (`git checkout --orphan`) — no shared history
with `master` at all. It contains exactly one commit: a snapshot of the current working
tree, built by:

```bash
git checkout master               # start from the real, full-history branch
git checkout --orphan github-push  # new branch, no history, keeps working-tree files
git rm -r --cached specs docs .claude   # untrack these three paths for this branch
rm -rf specs docs .claude               # remove them from the working tree too
git add -A
git commit -m "SocialFTE vX.Y.Z — <summary>"
git push origin github-push:master      # push this branch's single commit AS origin/master
git checkout master                     # switch back — restores specs/docs/.claude from master's own tree
```

The push target is `github-push:master` — pushing a *local* branch named `github-push` to
the *remote* branch named `master`. In principle the remote should never see a branch
called `github-push`; in practice a stray `refs/heads/github-push` showed up on the remote
once anyway (cause unconfirmed — possibly a `push.default` config interaction). Check for
it and delete it if present, so the public repo only ever has one branch:

```bash
git ls-remote origin                        # should list only refs/heads/master (+ HEAD)
git push origin --delete github-push         # if a stray one shows up
```

**After pushing, always `git checkout master` before making any further changes.** It's
easy to keep working while still checked out on the `github-push` orphan branch — any
commits made there won't have `specs/`/`docs/`/`.claude/` restored (they were `rm -rf`'d
for that branch) and, more importantly, they won't be part of `master`'s real history
unless explicitly `git cherry-pick`ed over. If this happens, cherry-pick the commit onto
`master` from `github-push`'s log before doing anything else:

```bash
git log --oneline github-push -3   # find the commit(s) made while on the wrong branch
git checkout master
git cherry-pick <sha>
```

## Doing this again for the next update

`github-push`'s single commit is now stale the moment you make new changes on `master`.
Repeat the same recipe from scratch each time — don't try to `git merge` new work into
`github-push`, since it has no shared history with `master` to merge cleanly against:

```bash
cd "/path/to/SocialFTE"
git status --short   # must be clean — stash or commit first if not
git checkout master
git branch -D github-push          # drop the previous snapshot
git checkout --orphan github-push
git rm -r --cached specs docs .claude
rm -rf specs docs .claude
git add -A
git commit -m "SocialFTE vX.Y.Z — <what changed>"
git push origin github-push:master
git checkout master                # restores specs/, docs/, .claude/skills/ from disk
```

## The one non-obvious gotcha

If you ever need to *restore* `.claude/skills/` from git history onto disk (e.g. it gets
deleted again, or a fresh clone doesn't have it because it's gitignored and was never a
real install), **`git checkout <commit> -- <path>` also stages that path**, even though the
path is gitignored — gitignore doesn't protect against an *explicit* path checkout. If you
do this:

```bash
git checkout 6851695 -- .claude/skills   # 6851695 = the initial commit, before the strip
```

follow it immediately with:

```bash
git reset -- .claude/skills   # un-stage — keep the files on disk, don't re-track them
```

Skipping the `reset` step means the next commit on whatever branch you're on would
re-commit all 719 files. Verify with `git status` — it should show nothing pending once
this is done correctly.

## Before every push: what to check

- `git ls-remote origin` — confirms you're pushing to the right place and see the current
  remote state before overwriting it.
- `git status --short` on `master` before starting — must be clean (uncommitted work would
  otherwise carry into the orphan branch's working tree and get squashed in unintentionally).
- Skim the new commit's `git show --stat` before pushing — a fast sanity check that only the
  expected top-level directories are present and `specs/`, `docs/`, `.claude/` are absent.
- No `.env`/`.env.local`/`.env` files should ever appear — `.gitignore`'s `.env`/`.env.local`
  patterns already cover every `apps/*/.env*` variant (gitignore patterns without a leading
  `/` match at any depth), and this was verified clean via a full-history secret scan before
  the first push (no API keys, private keys, or `.env` files anywhere in git history).

## Current state (as of the first push)

- Remote: `origin` → `https://github.com/mrowaisabdullah/socialfte.git`
- Pushed: `github-push` (local) → `master` (remote), a single squashed commit
- Excluded from the public repo: `specs/`, `docs/`, `.claude/` (skills + commands)
- Local `master` and all `NNN-weekN-*` branches are untouched — full real history stays
  local, only the filtered snapshot goes to GitHub
