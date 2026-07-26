# Technical Deep-Dive Template

Template for explaining technical concepts, solutions, or debugging stories.

Updated v2.0: Research-backed format from top LinkedIn creators.

## Structure (Problem → Process → Outcome → Lesson)

```
1. HOOK (One-liner problem, under 12 words)
   → What you were solving

2. PROBLEM (2-3 lines max)
   → Why it was hard

3. SOLUTION (2-3 lines max)
   → Your approach + code snippet

4. OUTCOME (1-2 lines)
   → Result

5. LESSON (1-2 lines)
   → Key takeaway

6. CTA (Required)
   → Question

[3-5 hashtags]
```

## Template (v2.0)

```python
def generate_technical_post(
    hook: str,           # Problem one-liner (under 12 words)
    problem: str,        # What was hard (2-3 lines)
    solution: str,       # Your approach + code
    outcome: str,        # Result (1-2 lines)
    lesson: str,         # Key takeaway (1-2 lines)
    hashtags: list[str], # 3-5 relevant tags
) -> str:
    """Generate a technical post (700-1000 chars optimal)."""
    return f"""
{hook}

{problem}

{solution}

{outcome}

{lesson}

Ever hit this?
What happened?
👇

{' '.join('#' + h for h in hashtags)}
    """.strip()
```

## v2.0 Requirements

| Rule | Requirement |
|------|-------------|
| Hook | One-liner problem, under 12 words |
| Line breaking | Break most lines to new lines, combine some for flow |
| Paragraphs | Max 3-4 lines each |
| Sentences | Under 12 words (most under 10) |
| Length | 700-1000 characters |
| Emojis | Max 1-2 total |
| Code | 5-15 lines max (relevant only) |
| CTA | Required at end |
| Language | Simple English |

## Key Techniques from Gold Standard

**Rhythm & Pacing:**
- Ultra-short lines (2-3 words) for emphasis: "Now it works."
- Single-line dramatic effect: "I paused."
- Combined thoughts where natural: "Because real teams don't work like solo todo lists."
- Build tension → Problem → Solution → Insight

## Examples (Updated v2.0)

### Example 1: Debugging Story (Gold Standard Style - 820 chars)

```
Spent 4 hours debugging a 422 error.

Here's what I learned.

The problem:
FastAPI kept returning 422.
My Pydantic model had optional nested fields.

I tried everything.
Removed the Optional.
Made it required.
Still failed.

Then I found the issue.
Optional needs explicit type hints at every level.

The fix:
```python
class Item(BaseModel):
    name: str
    metadata: Optional[Dict[str, Any]] = None
```

Now it works.

Lesson:
Read the Pydantic docs.
The validation rules are powerful but non-obvious.

Ever hit a 422 error?
What was the cause?
👇

#python #fastapi #debugging
```

**Analysis:**
- Ultra-short pacing: "Now it works." ✓
- Single-line emphasis: "Still failed." ✓
- Hook: 7 words ✓
- Length: 820 chars ✓

### Example 2: Performance Fix (Gold Standard Style - 780 chars)

```
Reduced API response time from 800ms to 120ms.

Here's how.

The problem:
Database was N+1-ing on every request.
Fetching users, then permissions one by one.

Users waited.
Timeouts happened.
People complained.

The solution:
Eager loading with select_inload.

```python
from sqlalchemy.orm import select_inload

users = (
    session.query(User)
    .options(select_inload(User.permissions))
    .all()
)
```

Now all permissions load in one query.

Huge speed up.

Lesson:
Profile before optimizing.
The bottleneck is rarely where you expect.

What's your biggest performance win?
👇

#python #sqlalchemy #performance
```

**Analysis:**
- Ultra-short pacing: "Users waited. Timeouts happened. People complained." ✓
- Combined flow: "Huge speed up." ✓
- Hook: 8 words ✓
- Length: 780 chars ✓

### Example 3: Architecture Decision (Gold Standard Style - 850 chars)

```
I chose PostgreSQL over MongoDB.

Here's why.

I needed:
 • Complex joins
 • ACID transactions
 • Full-text search
 • Mature tooling

MongoDB is great for documents.
But relational data with foreign keys?
That's Postgres territory.

I hesitated at first.
Mongo seemed more flexible.
Schema-less. Fast.

Then reality hit.
My data had relationships.
Users belong to teams.
Teams have projects.
Projects have tasks.

Added pgvector later for AI search.
Postgres keeps being the right choice.

Lesson:
Pick boring tech that fits your data.
Not whatever's trending.

What's your favorite database?
Why?
👇

#database #postgres #architecture
```

**Analysis:**
- Ultra-short pacing: "Schema-less. Fast." ✓
- Single-line emphasis: "Then reality hit." ✓
- Hook: 7 words ✓
- Length: 850 chars ✓

### Example 4: Code Pattern (Gold Standard Style - 750 chars)

```
The sentinel pattern in Python.

When None isn't enough.

The problem:
How to tell if a parameter was provided?
When "not set" and "set to None" look the same.

Wrong way:
```python
def update(task_id: int, assignee: Optional[int] = None):
    if assignee:  # Bug! Can't set to 0
        ...
```

This fails.
Can't set assignee to 0.
False means "not set."

Right way:
```python
_UNSET = object()  # Module level

def update(task_id: int, assignee: Optional[int] = _UNSET):
    if assignee is not _UNSET:  # Works!
        ...
```

Now 0 is valid.
And None is valid.
And _UNSET means "not provided."

This is what Typer and Pydantic use.

Lesson:
When None is a valid value?
Use a sentinel.

Ever use this pattern?
Where?
👇

#python #patterns #coding
```

**Analysis:**
- Ultra-short pacing: "Can't set assignee to 0. False means 'not set.'" ✓
- Single-line emphasis: "This fails." ✓
- Hook: 7 words ✓
- Length: 750 chars ✓

### Example 5: Tooling Setup (Gold Standard Style - 720 chars)

```
I set up pre-commit hooks today.

Here's what changed.

What they do:
 • Run black (formatting)
 • Sort imports
 • Check types
 • Run tests

If any check fails?
Commit is rejected.

Setup was simple:
```yaml
repos:
  - repo: https://github.com/psf/black
    rev: 23.1.0
    hooks:
      - id: black
```

Caught 3 type hints I missed.
Before my first push.

Lesson:
Automate quality checks.
Your future self will thank you.

What tools do you use?
👇

#python #tooling #workflow
```

**Analysis:**
- Ultra-short pacing: "Commit is rejected." ✓
- Combined flow: "Caught 3 type hints I missed. Before my first push." ✓
- Hook: 6 words ✓
- Length: 720 chars ✓

## Checklist (v2.0)

Every technical post must include:

- [ ] **One-liner hook** (problem, under 12 words)
- [ ] **Max 3 lines per paragraph** (scannable on mobile)
- [ ] **White space after each line** (easy to read)
- [ ] Clear problem statement
- [ ] Your specific approach or solution
- [ ] Code snippet (5-15 lines max, relevant only)
- [ ] Result or outcome
- [ ] **CTA at end** (question or prompt)
- [ ] 3-5 relevant hashtags
- [ ] **700-1000 characters** (optimal length)
- [ ] Simple English (non-native friendly)

## Common Mistakes (v2.0)

1. **Too much code**: Posting 50+ lines
   - Fix: Show only relevant snippet (5-15 lines)

2. **No context**: Here's how to do X
   - Fix: Start with the problem you were solving

3. **Wall of text**: Long paragraphs
   - Fix: Max 3 lines per paragraph, add white space

4. **No CTA**: Post just ends with the code
   - Fix: Always ask "Ever hit this? What happened?"

5. **Too broad**: How to build an entire API
   - Fix: Focus on one specific problem or pattern

## Platform Variations

### LinkedIn (700-1000 chars optimal)
- One-liner hook first
- Max 3 lines per paragraph
- Code blocks with triple backticks
- CTA required at end

### Twitter (200-270 chars, use thread)
```
1/ Spent 4 hours debugging a 422 error.

The problem:
Pydantic models don't handle optional nested fields well.

The fix:
class Item(BaseModel):
    metadata: Optional[Dict] = None

#python #fastapi

2/ Lesson:
Explicit type hints at every level.

Read the Pydantic docs.
The rules are powerful but non-obvious.

Ever hit a 422?
What happened?
👇
```

### WhatsApp (50-150 chars, brief)
```
Just fixed a tricky bug in 4 hours.
Turns out Pydantic needs explicit type hints for optional fields.
Read the docs, folks.
```

## Prompt Examples

When invoking the skill, describe:

1. **Hook** - Problem one-liner
2. **Problem** - What was hard
3. **Solution** - Your approach + code
4. **Outcome** - Result
5. **Lesson** - Key takeaway
6. **Platform** - LinkedIn, Twitter, or WhatsApp

Example prompt:
```
"Write a LinkedIn technical post.
Hook: Spent 4 hours debugging a race condition
Problem: Async function wasn't awaiting DB call
Solution: Made it synchronous first, added type hints
Outcome: Fixed it, learned to start simple
Lesson: Add complexity only when proven
Target 800 characters, include CTA"
```

---

**Version**: 2.0.0
**Last Updated**: 2025-01-28
**Based On**: Aisha Riaz Problem-Process-Outcome-Lesson structure
