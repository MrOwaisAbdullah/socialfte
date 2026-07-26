# Announcement Post Template

Template for launching something new - a project, course, video, or update.

Updated v2.0: Research-backed format from top LinkedIn creators.

## Structure (Hook → What → Details → Who → CTA)

```
1. HOOK (One-liner, under 12 words)
   → Big moment

2. WHAT (2-3 lines max)
   → What you're launching

3. WHY (2-3 lines max)
   → Backstory or motivation

4. DETAILS (2-3 lines max)
   → What's included

5. WHO (1-2 lines)
   → Target audience

6. CTA (Required)
   → Link or invite

[3-5 hashtags]
```

## Template (v2.0)

```python
def generate_announcement_post(
    hook: str,              # One-liner moment (under 12 words)
    what: str,              # What you're launching (2-3 lines)
    why: str,               # Why it matters (2-3 lines)
    details: str,           # What's included (2-3 lines)
    who: str,               # Who this is for (1-2 lines)
    hashtags: list[str],    # 3-5 relevant tags
) -> str:
    """Generate an announcement post (700-1000 chars optimal)."""
    return f"""
{hook}

{what}

{why}

{details}

{who}

Check it out here:
👉 [link]

What do you think?
👇

{' '.join('#' + h for h in hashtags)}
    """.strip()
```

## v2.0 Requirements

| Rule | Requirement |
|------|-------------|
| Hook | One-liner, under 12 words |
| Line breaking | Break most lines to new lines, combine some for flow |
| Paragraphs | Max 3-4 lines each |
| Sentences | Under 12 words (most under 10) |
| Length | 700-1000 characters |
| Emojis | Max 1-2 total |
| CTA | Required at end |
| Language | Simple English |

## Key Techniques from Gold Standard

**Rhythm & Pacing:**
- Ultra-short lines (2-3 words) for emphasis: "Not polished. Not scripted."
- Single-line dramatic effect: "I paused."
- Combined thoughts where natural: "Because real teams don't work like solo todo lists."
- Build tension → Problem → Solution → Launch

## Examples (Updated v2.0)

### Example 1: First Video Launch (Gold Standard Style - 820 chars)

```
I just recorded my first video.

Not polished.
Not scripted.
Just me sharing what I built.

For a long time, I held back.
I thought:
 ❌ "Who will listen?"
 ❌ "I need to be perfect."
 ❌ "I'm not ready."

Then a creator reached out.
Invited me to contribute to a course.
That felt like a push.
Time to start.

So I hit record.

The video covers:
 👉 Weather AI agent with free Gemini
 👉 Chat frontend in ChainLit (28 lines)
 👉 Deploy on Hugging Face Spaces

All under 100 lines of code.

This is for:
- Beginners who learn by building
- Anyone afraid to start sharing

Perfection isn't the point.
Starting is.

👉 Watch here: [link]

What's something you've been putting off?
👇

#AI #AIagents #Python
```

**Analysis:**
- Ultra-short pacing: "Not polished. Not scripted." ✓
- Combined flow: "Perfection isn't the point. Starting is." ✓
- Hook: 7 words ✓
- Length: 820 chars ✓

### Example 2: Course Launch (Gold Standard Style - 780 chars)

```
I just launched a free AI agents course.

Here's what you'll learn.

When I started, I struggled.
Docs were confusing.
Examples too complex.
No clear starting point.

I felt stuck.
Overwhelmed.
Ready to quit.

Then I changed my approach.

So I built small projects.
Documented everything.
Learned by doing.

The course covers:
 👉 What AI agents are (no jargon)
 👉 Build your first agent (50 lines)
 👉 Connect to tools (APIs, DBs)
 👉 Deploy for free

This is for:
- Beginners who know some Python
- Curious developers
- Anyone who learns by building

It's free.
Always will be.

👉 Enroll here: [link]

What topics should I add next?
👇

#AI #Education #Python
```

**Analysis:**
- Ultra-short pacing: "Stuck. Overwhelmed. Ready to quit." ✓
- Single-line emphasis: "Then I changed my approach." ✓
- Hook: 7 words ✓
- Length: 780 chars ✓

### Example 3: Open Source Release (Gold Standard Style - 750 chars)

```
I just open-sourced my first project.

It's called TaskFlow.
A CLI task manager.
Python + Typer.

Why I built it:
I needed something simple.
Existing tools were too complex.
Or too basic.

What it does:
 • Add, list, update tasks
 • Assign to team members
 • Filter by status
 • Works offline

This is for:
- Terminal users
- Teams who want simple
- Anyone who likes clean code

Tests included.
Contributions welcome.

👉 Check it out: [link]

Ever open-sourced something?
How did it go?
👇

#OpenSource #Python #CLI
```

**Analysis:**
- Ultra-short pacing: "Tests included. Contributions welcome." ✓
- Combined flow: "Existing tools were too complex. Or too basic." ✓
- Hook: 6 words ✓
- Length: 750 chars ✓

### Example 4: Newsletter Launch (Gold Standard Style - 720 chars)

```
I'm starting a newsletter.

Practical AI tips for developers.
No hype.
No fluff.
Just stuff that works.

I learn new things daily.
Most are small.
A trick.
A workaround.
A better way.

I share some on LinkedIn.
But not everything.

The newsletter is for the deeper stuff.
Things that take more than a post.

What you'll get:
- One email per week (max)
- Practical tutorials
- Code you can use

This is for developers who use AI.
Not just talk about it.

First issue this Sunday.

👉 Subscribe: [link]

What newsletters do you read?
👇

#AI #Newsletter #Developers
```

**Analysis:**
- Ultra-short pacing: "No hype. No fluff. Just stuff that works." ✓
- Single-line emphasis: "But not everything." ✓
- Hook: 4 words ✓
- Length: 720 chars ✓

### Example 5: Job Update (Gold Standard Style - 680 chars)

```
I'm joining [Company] as [Role].

What I'll work on:
- [Project 1]
- [Project 2]
- [Project 3]

Why I'm excited:
The team builds something meaningful.
Tech stack aligns with what I love.
Lots of room to grow.

Grateful to everyone who supported this journey.
You know who you are.

This is a new chapter.

On to the next one.
🚀

What's your best career advice?
👇

#CareerUpdate #NewJob #Tech
```

**Analysis:**
- Ultra-short pacing: "You know who you are." ✓
- Combined flow: "The team builds something meaningful." ✓
- Hook: 6 words ✓
- Length: 680 chars ✓

## Checklist (v2.0)

Every announcement post must include:

- [ ] **One-liner hook** (big moment, under 12 words)
- [ ] **Max 3 lines per paragraph** (scannable on mobile)
- [ ] **White space after each line** (easy to read)
- [ ] What you're launching (specific)
- [ ] Why it matters (backstory)
- [ ] What's included (details)
- [ ] Who it's for (audience)
- [ ] **CTA at end** (link + question)
- [ ] 3-5 relevant hashtags
- [ ] **700-1000 characters** (optimal length)
- [ ] Simple English (non-native friendly)

## Tone Guidelines

| Do | Don't |
|----|----|
| Be excited but real | Use hype words |
| Be specific (100 lines) | Be vague (lots of content) |
| Show vulnerability | Pretend it's perfect |
| Include real links | Say "link in bio" |
| End with a question | End without CTA |

## Common Mistakes (v2.0)

1. **Weak hook**: "So today I have an announcement..."
   - Fix: "I just launched my first course."

2. **Too much backstory**: Long story about your journey
   - Fix: 2-3 lines max on why it matters

3. **No clear details**: "It has lots of features"
   - Fix: List 3-4 specific things it includes

4. **No link**: "Check it out on my profile"
   - Fix: Always include direct link with 👉

5. **No CTA question**: Post just ends with the link
   - Fix: Always ask "What do you think?"

## Platform Variations

### LinkedIn (700-1000 chars optimal)
- One-liner hook first
- Max 3 lines per paragraph
- Bullet points for details
- CTA with link required

### Twitter (200-270 chars, shorter)
```
Just launched a free AI agents course.

Covers building agents with Python.
No jargon, no fluff.
Practical stuff.

👉 [link]

For beginners who learn by building.
What topics should I add?
```

### WhatsApp (50-150 chars, personal)
```
Just launched my first video course! Building AI
agents with Python. Free forever. Link if interested:
[short-url]
```

## Prompt Examples

When invoking the skill, describe:

1. **Hook** - One-liner moment
2. **What** - What you're launching
3. **Why** - Why it matters
4. **Details** - What's included
5. **Who** - Target audience
6. **Platform** - LinkedIn, Twitter, or WhatsApp

Example prompt:
```
"Write a LinkedIn announcement post.
Hook: I just launched a free AI agents course
What: Course covers building agents with Python
Why: Struggled with confusing docs, learned by doing
Details: What agents are, build first agent, connect tools, deploy free
Who: Beginners who know Python, curious devs
Link: [course-link]
Target 800 characters, include CTA"
```

---

**Version**: 2.0.0
**Last Updated**: 2025-01-28
**Based On**: Justin Welsh 5-step formula + user's authentic voice
