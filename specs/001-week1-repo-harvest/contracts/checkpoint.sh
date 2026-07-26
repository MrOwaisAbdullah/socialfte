#!/usr/bin/env bash
# Contract for Story 6 (FR-021, FR-022). Not executed by /sp.plan.
# Each check must print PASS/FAIL individually; the commit (last line) only runs if
# every check above it passed. Mirrors data-model.md's CheckpointItem table.
set -uo pipefail
fail=0

check() { # name, command
  if eval "$2" >/dev/null 2>&1; then echo "PASS  $1"; else echo "FAIL  $1"; fail=1; fi
}

check "tree: old paths gone"        '! ls remotion tools/cutlib.py tools/yt_upload.py >/dev/null 2>&1'
check "tree: new paths exist"       'test -d packages/remotion && test -d tools/media && test -f apps/worker/publishers/youtube.py'
check "tree: protected libs intact" 'test -d media/library/sfx && test -d media/library/music && test -f media/library/catalog.json'
PY=$(command -v python3 || command -v python)
check "imports"                     '"$PY" -c "import tools.media.cutlib, tools.media.clean_voice, tools.media.render_cuts, tools.media.verify_cut"'
check "identity: SOUL.md"           'test -f SOUL.md'
check "identity: IDENTITY.md"       'test -f IDENTITY.md'
check "identity: AGENTS.md"         'test -f AGENTS.md'
check "identity: HEARTBEAT.md"      'test -f HEARTBEAT.md'
check "identity: TOOLS.md"          'test -f TOOLS.md'
check "identity: MEMORY.md"         'test -f MEMORY.md'
check "brand: BRAND.md"             'test -f BRAND.md'
check "brand: brand.ts"             'test -f packages/remotion/src/brand.ts'
check "requirements.txt updated"    'grep -q "^litellm" requirements.txt && ! grep -q "^requests" requirements.txt'
check "claude.md points at agents"  'test -L CLAUDE.md || grep -q "See AGENTS.md" CLAUDE.md'

if [ "$fail" -eq 0 ]; then
  git add -A
  if git commit -m "week1: strip, restructure, identity files"; then
    echo "COMMITTED"
  else
    echo "COMMIT FAILED — see git's error above (e.g. missing user.name/user.email); nothing was committed, changes remain staged"
    exit 1
  fi
else
  echo "NOT COMMITTED — fix the FAIL lines above and re-run"
  exit 1
fi
