#!/bin/bash

# gemini-refactor.sh
# Usage: ./gemini-refactor.sh <file_path> "<instructions>"

# 1. Pre-flight Checks
if ! command -v gemini &> /dev/null;
    echo "Error: 'gemini' CLI is not installed or not in your PATH."
    exit 1
fi

FILE_PATH="$1"
INSTRUCTIONS="$2"
PROMPT_TEMPLATE=".claude/skills/gemini-frontend-assistant/templates/react-component.prompt.txt"

if [ -z "$FILE_PATH" ] || [ -z "$INSTRUCTIONS" ]; then
  echo "Usage: $0 <file_path> \"<instructions>\""
  exit 1
fi

if [ ! -f "$FILE_PATH" ]; then
  echo "Error: File '$FILE_PATH' not found."
  exit 1
fi

if [ ! -f "$PROMPT_TEMPLATE" ]; then
    echo "Error: Prompt template not found at $PROMPT_TEMPLATE"
    exit 1
fi

# Read the system prompt template
SYSTEM_PROMPT=$(cat "$PROMPT_TEMPLATE")

# Read the target file content
FILE_CONTENT=$(cat "$FILE_PATH")

# Construct the full prompt
FULL_PROMPT="$SYSTEM_PROMPT\n\n---\n\n**Task:** $INSTRUCTIONS\n\n**File Content:**\n$FILE_CONTENT"

# Call Gemini CLI
gemini generate-content "$FULL_PROMPT"