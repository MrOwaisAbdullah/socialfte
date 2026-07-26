#!/usr/bin/env bash
# Contract for Story 1 (FR-001, FR-002). Not executed by /sp.plan.
# /sp.tasks turns this into a confirmed, gated task; /sp.implement runs it only after
# the composition-name review (FR-001) has been shown to the operator.
#
# Corrected against research.md Decisions 2-3 — do not copy docs/repo-harvest.md §2
# literally, three of its paths don't match this fork's actual tree.
set -euo pipefail

# Dev-content-only skills
rm -rf .claude/skills/fake-screencast
rm -rf .claude/skills/clean-cut
rm -rf .claude/skills/suggest-sfx

# Remotion libs for simulating dev screens — FILES in this fork, not directories
rm -f  remotion/src/lib/browser.tsx
rm -f  remotion/src/lib/vscode.tsx
rm -f  remotion/src/lib/screencast.tsx
rm -rf remotion/src/shots/*          # all 37 compositions (example/ + brand/) — review names FIRST

# Tools that don't apply to SocialFTE
rm -f  tools/capture_web.py
rm -rf tools/editor/
rm -f  tools/transcribe.py
rm -f  tools/gen_sfx.py
rm -f  tools/gen_music.py
rm -f  tools/gen_thumbnail.py
rm -f  tools/yt_stats.py

# Media that doesn't apply — these are NOT empty, delete in full anyway (research.md Decision 3)
rm -rf media/library/faces/
rm -rf media/projects/*
rm -rf videos/

# NEVER touch these (verify still present after the above):
#   media/library/sfx/
#   media/library/music/
#   media/library/catalog.json
