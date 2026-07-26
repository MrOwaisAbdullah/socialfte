# Social Media Writer Skill

A personal writing system for professional social media that generates authentic, grounded content—free from marketing fluff and tech-bro clichés.

## Overview

This skill encodes a battle-tested personal writing style developed over years of posting on LinkedIn, Twitter/X, and WhatsApp. It focuses on clarity, authenticity, and earned confidence rather than hype and engagement bait.

## What Makes This Different

Most AI social media tools generate generic, hype-filled content that sounds like every other marketing bot. This skill does the opposite:

| Generic AI Content | This Skill |
|-------------------|------------|
| "Revolutionary breakthrough!" | "Here's what worked for me" |
| "Game-changing innovation" | "Reduced latency by 40%" |
| "Follow your dreams!" | "Try this approach instead" |
| "Humbled to announce..." | "Just shipped a new feature" |
| Lots of exclamation points!!! | Periods over excitement |

## How It Works

1. **You provide context**: What you want to share, relevant details, platform
2. **Skill selects template**: Based on content type (achievement, technical, advice, etc.)
3. **Generates draft**: Using S.T.A.R. framework (Situation, Task, Action, Result)
4. **Validates quality**: Checks banned words, sentence length, tone rules
5. **Outputs post**: Platform-formatted, ready to post

## Supported Post Types

| Type | Use Case | Template |
|------|----------|----------|
| **Achievement** | Shipped a project, completed a goal | Outcome → What → Numbers → Insight |
| **Technical** | Explained a technical concept/solution | Problem → Why → Approach → Result |
| **Hackathon** | Recapped a hackathon experience | Built → Challenge → Solution → Learning |
| **Advice** | Shared something you learned | Observation → What works → Example → Why |
| **Announcement** | Launched something new | What → Why → Who → CTA |

## Supported Platforms

| Platform | Max Length | Style | Hashtags |
|----------|------------|-------|----------|
| **LinkedIn** | 1300 chars | Professional but conversational | 3-5 relevant |
| **Twitter/X** | 280 chars | Concise, insight-first | 2-3 relevant |
| **WhatsApp** | Brief | Personal, casual | None |

## Quality Checks

Every post automatically validates against:

- **Banned words filter**: 100+ phrases rejected (marketing hype, clichés, filler)
- **Sentence length**: Most under 15 words, max 20
- **Excessive punctuation**: Max 2 exclamation points
- **Specificity**: Must include numbers or concrete examples
- **Human tone**: Must sound like a real person, not marketing copy

## Quick Examples

### LinkedIn Achievement Post
```
Just completed a 48-hour hackathon with my team.

We built an AI-powered task manager using:
- Python + FastAPI backend
- React + Tailwind frontend
- OpenAI API for task prioritization

Took 2nd place out of 12 teams. Main challenge was
handling rate limits—solved it with request queuing.

Fun weekend, learned a lot about async Python.

#hackathon #webdev #python
```

### Twitter Technical Thread
```
1/ Spent way too long today figuring out why my
FastAPI endpoints were returning 422 errors.

Turns out Pydantic models don't automatically handle
optional nested fields. Need explicit Optional[...]
type hints.

2/ The fix:

class Item(BaseModel):
    name: str
    metadata: Optional[Dict[str, Any]] = None

Explicit > implicit. Got it.

3/ Lesson: Read the Pydantic docs cover to cover.
The validation rules are powerful but non-obvious.
```

### WhatsApp Status
```
Just shipped the feature I've been working on for
two weeks. Time for sleep.
```

## Usage

Invoke the skill and describe:

```
"Write a LinkedIn post about launching my first
open source project. It's a CLI tool for task
management, built with Python and typer. Got
50 stars in the first week."
```

The skill will generate a validated post using the achievement template, filtering any banned phrases and ensuring proper length and tone.

## File Structure

```
.claude/skills/social-media-writer/
├── SKILL.md                    # Main skill definition
├── README.md                   # This file
├── lessons/
│   ├── BANNED_WORDS.md         # Complete banned phrases list
│   ├── WRITING_CHECKLIST.md    # Quality validation rules
│   └── PLATFORM_GUIDE.md       # Platform-specific guidance
├── templates/
│   ├── achievement-post.md     # Achievement template
│   ├── technical-post.md       # Technical deep-dive
│   ├── hackathon-post.md       # Hackathon recap
│   ├── advice-post.md          # Advice post
│   └── announcement-post.md    # Announcement template
└── scripts/
    └── validator.py            # Content validation helper
```

## Core Principles

### 1. Clarity Over Cleverness
- Say exactly what you mean
- One idea per sentence
- Short words, short sentences
- Remove unnecessary words

### 2. Human-First Tone
- Write like you talk to a colleague
- Casual but professional
- No buzzwords or jargon unless necessary
- Admit when you don't know something
- Share struggles, not just wins

### 3. Earned Confidence
- State facts, don't hype
- Let results speak
- "This worked for me" not "This will change your life"
- Specifics over superlatives

## Banned Phrases (Sample)

The skill filters out 100+ phrases including:

**Marketing Hype:**
- "Game-changing" / "Revolutionary" / "Groundbreaking"
- "Cutting-edge" / "State-of-the-art"
- "Paradigm shift" / "Quantum leap"

**Filler Phrases:**
- "At the end of the day"
- "It is important to note"
- "Needless to say"

**Clichés:**
- "Crushing it" / "Killing it"
- "Thought leader" / "Visionary"
- "Rockstar developer" / "Ninja"

See `lessons/BANNED_WORDS.md` for the complete list.

## Time Savings

| Task | Without Skill | With Skill |
|------|--------------|------------|
| Draft post | 15-20 min | 2 min |
| Edit for tone | 10-15 min | Auto |
| Check banned words | 5 min | Auto |
| Validate length | 2 min | Auto |
| **Total** | **30-40 min** | **2 min** |

## Related Skills

- `console-cli-builder` - Build CLI apps worth announcing
- `deployment-engineer` - Deploy projects to share

---

**Version**: 1.0.0
**Based On**: Personal writing system
**Last Updated**: 2025-01-28
