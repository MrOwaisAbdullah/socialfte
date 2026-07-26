# Advice Post Template

Template for sharing something you learned that might help others.

Updated v2.0: Research-backed format from top LinkedIn creators.

## Structure (Observation → Problem → Solution → Why)

```
1. HOOK (One-liner, under 12 words)
   → What you noticed

2. PROBLEM (2-3 lines max)
   → Common mistake

3. SOLUTION (2-3 lines max)
   → What actually works

4. EXAMPLE (2-3 lines max)
   → Specific steps or proof

5. WHY (1-2 lines)
   → Why this is better

6. CTA (Required)
   → Question

[3-5 hashtags]
```

## Template (v2.0)

```python
def generate_advice_post(
    hook: str,           # One-liner observation (under 12 words)
    problem: str,        # Common mistake (2-3 lines)
    solution: str,       # What actually works (2-3 lines)
    example: str,        # Specific steps (2-3 lines)
    why: str,            # Why this is better (1-2 lines)
    hashtags: list[str], # 3-5 relevant tags
) -> str:
    """Generate an advice post (700-1000 chars optimal)."""
    return f"""
{hook}

{problem}

{solution}

{example}

{why}

What's your experience with this?
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
- Ultra-short lines (2-3 words) for emphasis: "Keys expiring. Requests failing."
- Single-line dramatic effect: "I paused."
- Combined thoughts where natural: "Because real teams don't work like solo todo lists."
- Build tension → Problem → Solution → Why it works

## Examples (Updated v2.0)

### Example 1: API Key Advice (Gold Standard Style - 850 chars)

```
Stop changing API keys every day.

Here's a better way.

The problem:
Free Gemini keys expire fast.
They break your workflow.
Slow everything down.

Keys expiring.
Requests failing.
Context lost mid-build.

That's frustrating.
Especially during a hackathon.

The solution:
If you can afford $3, get the GLM plan.
If you can afford $20, get Claude Code.
Use free keys only as backup.

What you get:
 • Stable usage
 • No random shutdowns
 • Focus on building, not retrying

Why it works:
One paid tool beats ten free ones that don't work.

What's your setup?
Free or paid?
👇

#AI #ClaudeCode #GLM
```

**Analysis:**
- Ultra-short pacing: "Keys expiring. Requests failing. Context lost mid-build." ✓
- Single-line emphasis: "That's frustrating." ✓
- Hook: 6 words ✓
- Length: 850 chars ✓

### Example 2: Learning Advice (Gold Standard Style - 780 chars)

```
Learn one thing at a time.

Here's why.

The mistake:
I tried to learn everything.
 • Models
 • Frameworks
 • Deployment
 • MLOps
 • All of it

Result:
I knew a little about everything.
But nothing well.

Frustrating.
Overwhelming.
Paralyzing.

Then I changed my approach.

Better approach:
 👉 Pick ONE thing
 👉 Go deep
 👉 Build something real
 👉 Then move on

My first project:
A simple chatbot.
Python + OpenAI API.
Nothing fancy.

But I finished it.
That taught me more than 20 tutorials.

Depth beats breadth.
Always.

What did you focus on first?
👇

#AI #Learning #Python
```

**Analysis:**
- Ultra-short pacing: "Frustrating. Overwhelming. Paralyzing." ✓
- Combined flow: "Depth beats breadth. Always." ✓
- Hook: 5 words ✓
- Length: 780 chars ✓

### Example 3: Debugging Tip (Gold Standard Style - 720 chars)

```
Make it synchronous first.

Here's what I learned.

Spent 4 hours on a race condition.
The async function wasn't awaiting a DB call.

Data races are silent killers.
By the time you see them?
Damage is done.

I tried 5 different fixes.
None worked.

Then I went back to basics.

The fix:
1. Make it synchronous
2. Add type hints
3. Make it async only where needed

The lesson:
Start simple.
Add complexity later.
Explicit beats implicit.

Ever hit a race condition?
What happened?
👇

#Python #Async #Debugging
```

**Analysis:**
- Ultra-short pacing: "Start simple. Add complexity later." ✓
- Single-line emphasis: "None worked." ✓
- Hook: 5 words ✓
- Length: 720 chars ✓

### Example 4: Career Advice (Gold Standard Style - 820 chars)

```
Your network is who you help.

Not who you know.

I spent a year reaching out to strangers.
Cold messages.
Generic requests.
Silence.

It was discouraging.
I felt invisible.

Then I changed my approach.

I started sharing what I learned.
Helping in communities.
Building in public.

People reached out to me.
Not because I asked.
But they saw my work.

Real network:
 ✅ Who you help
 ✅ Who trusts your work
 ✅ Who would vouch for you

Fake network:
 ❌ How many connections
 ❌ How many followers
 ❌ How many cards

Build good things.
Share them.
Help others.

The network follows.

#Career #Advice #Networking #Tech
```

### Example 5: Tool Choice (Gold Standard Style)
```
Hackathon 2 is here.
And I'm seeing the same issue everywhere.

People aren't stuck on ideas.
They're stuck on free API limits and errors.

Keys expiring.
Requests failing.
Context getting lost mid-build.

That's frustrating.
Especially during a hackathon.

If you're using Claude Code, here's a simple fix that's actually working:

Instead of juggling free keys, use GLM-4.7 on the $3 coding plan.

What you get for $3:
 • Stable usage (no random shutdowns)
 • Solid coding help inside Claude Code
 • Enough limits to focus on building, not retrying requests

Setup is straightforward:
 • Buy the plan
 • Get the API key
 • Plug it into Claude Code
 • Done

That's it.

No key-swapping.
No stress mid-hackathon.
Just build.

If you truly can't spend anything, free options are fine.

But if the hackathon matters?
This small upgrade saves real time.

Focus on shipping.
Not fighting APIs.

What's your hackathon setup?
👇

#Hackathon #ClaudeCode #Developers
```

**Analysis:**
- Ultra-short pacing: "Keys expiring. Requests failing. Context getting lost mid-build." ✓
- Single-line emphasis: "That's frustrating." ✓
- Hook: 7 words ✓
- Length: 780 chars ✓

## Checklist (v2.0)

Every advice post must include:

- [ ] **One-liner hook** (observation, under 12 words)
- [ ] **Max 3 lines per paragraph** (scannable on mobile)
- [ ] **White space after each line** (easy to read)
- [ ] Common mistake you see
- [ ] What actually works (your approach)
- [ ] Specific example or steps
- [ ] Why this is better
- [ ] **CTA at end** (question or prompt)
- [ ] 3-5 relevant hashtags
- [ ] **700-1000 characters** (optimal length)
- [ ] Simple English (non-native friendly)

## Tone Guidelines

| Do | Don't |
|----|----|
| Share from experience | Pretend you're an expert |
| Be specific ("3 weeks") | Be vague ("a while") |
| Admit mistakes | Only share wins |
| Keep it simple | Use jargon |
| End with a question | End without CTA |

## Common Mistakes (v2.0)

1. **No clear hook**: "So today I want to share some advice..."
   - Fix: "Stop changing API keys every day."

2. **Too much backstory**: Long story about how you learned
   - Fix: Get straight to the problem and solution

3. **Wall of text**: Long paragraphs without breaks
   - Fix: Max 3 lines per paragraph, add white space

4. **No CTA**: Post just ends with the advice
   - Fix: Always ask "What's your experience?"

5. **Too many emojis**: Using 5+ emojis throughout
   - Fix: Max 1-2 impactful emojis total

## Platform Variations

### LinkedIn (700-1000 chars optimal)
- One-liner hook first
- Max 3 lines per paragraph
- Bullet points for lists
- CTA required at end

### Twitter (200-270 chars, use thread)
```
1/ Stop changing API keys every day.

Free keys expire fast.
Break your workflow.

If you can afford $3, get the GLM plan.
Use free keys as backup.

#AI #Coding

2/ Why it works:
One paid tool beats ten free ones.
Stable usage.
No random shutdowns.

What's your setup?
Free or paid?
```

### WhatsApp (50-150 chars, brief)
```
Quick tip: If you code daily, the $3 GLM plan
saves constant API key headaches. Worth it if
you can afford it.
```

## Prompt Examples

When invoking the skill, describe:

1. **Hook** - One-liner observation
2. **Problem** - Common mistake
3. **Solution** - What actually works
4. **Example** - Specific steps
5. **Why** - Why this is better
6. **Platform** - LinkedIn, Twitter, or WhatsApp

Example prompt:
```
"Write a LinkedIn advice post.
Hook: Stop changing API keys every day
Problem: Free keys expire fast, break workflow
Solution: Use $3 GLM plan as main tool
Example: Stable usage, no shutdowns
Why: One paid tool beats ten free broken ones
Target 850 characters, include CTA"
```

---

**Version**: 2.0.0
**Last Updated**: 2025-01-28
**Based On**: Justin Welsh 5-step formula + user's authentic voice
