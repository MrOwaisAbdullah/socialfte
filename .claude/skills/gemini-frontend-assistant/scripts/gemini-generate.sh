#!/bin/bash

# gemini-generate.sh
# Usage: ./gemini-generate.sh "<description>" [image_path]

# 1. Pre-flight Checks
if ! command -v gemini &> /dev/null;
    echo "Error: 'gemini' CLI is not installed or not in your PATH."
    echo "Please install it via 'npm install -g @google/gemini-cli' (or your preferred method)."
    exit 1
fi

if [ -z "$GEMINI_API_KEY" ]; then
    echo "Warning: GEMINI_API_KEY environment variable is not set. The CLI might fail if not configured otherwise."
fi

DESCRIPTION="$1"
IMAGE_PATH="$2"
PROMPT_TEMPLATE=".claude/skills/gemini-frontend-assistant/templates/react-component.prompt.txt"

if [ -z "$DESCRIPTION" ]; then
  echo "Usage: $0 \"<description>\" [image_path]"
  exit 1
fi

if [ ! -f "$PROMPT_TEMPLATE" ]; then
    echo "Error: Prompt template not found at $PROMPT_TEMPLATE"
    exit 1
fi

# Read the system prompt template
SYSTEM_PROMPT=$(cat "$PROMPT_TEMPLATE")

# Construct the full prompt
FULL_PROMPT="$SYSTEM_PROMPT

---

**Task:** Create a component that matches this description:
$DESCRIPTION"

# Call Gemini CLI
if [ -n "$IMAGE_PATH" ]; then
  if [ ! -f "$IMAGE_PATH" ]; then
    echo "Error: Image '$IMAGE_PATH' not found."
    exit 1
  fi
  # Quoted "$IMAGE_PATH" handles spaces correctly
  gemini generate-content --image "$IMAGE_PATH" "$FULL_PROMPT"
else
  gemini generate-content "$FULL_PROMPT"
fi