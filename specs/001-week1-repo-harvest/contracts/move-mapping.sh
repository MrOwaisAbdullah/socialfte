#!/usr/bin/env bash
# Contract for Story 2 (FR-004..FR-008). Not executed by /sp.plan.
# Run only after delete-list.sh has completed and been reviewed (Story 1 done).
#
# IMPORTANT: delete-list.sh uses plain rm/rm -rf, not git rm — so run
# `git add -A` (or `git add -A -- <the deleted paths>`) to stage those deletions
# BEFORE this script, or `git mv remotion packages/remotion` will fail with
# "bad source" the moment it hits a file inside remotion/ that's already gone from
# disk but still shows as tracked-and-present in git's index.
set -euo pipefail

mkdir -p packages apps/dashboard apps/worker/publishers

# Remotion: whole project moves under packages/
git mv remotion packages/remotion
mkdir -p packages/remotion/src/compositions   # replaces src/shots/, left empty this week

# ffmpeg tool layer -> tools/media/
mkdir -p tools/media
git mv tools/cutlib.py       tools/media/cutlib.py
git mv tools/render_cuts.py  tools/media/render_cuts.py
git mv tools/verify_cut.py   tools/media/verify_cut.py
git mv tools/bake.py         tools/media/bake.py
git mv tools/clean_voice.py  tools/media/clean_voice.py
git mv tools/mix_sfx.py      tools/media/mix_sfx.py
git mv tools/mix_music.py    tools/media/mix_music.py
git mv tools/models          tools/media/models

# Publisher, unmodified logic (FR-006)
git mv tools/yt_upload.py apps/worker/publishers/youtube.py
git mv tools/yt_upload_SETUP.md docs/youtube-oauth.md

# Empty placeholders for later weeks
touch apps/dashboard/.gitkeep apps/worker/.gitkeep

echo "Now: (1) retarget aspect-ratio refs in packages/remotion/remotion.config.ts to 1080x1920,"
echo "     (2) remove clean_voice.py's ElevenLabs branch (keep --method rnnoise only),"
echo "     (3) fix tools/media/render_cuts.py and tools/media/verify_cut.py:"
echo "         'from cutlib import ...' -> 'from tools.media.cutlib import ...' (research.md Decision 7)"
echo "     (4) verify: python -c \"import tools.media.cutlib; import tools.media.clean_voice; import tools.media.render_cuts; import tools.media.verify_cut\""
