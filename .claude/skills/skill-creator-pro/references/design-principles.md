# Design Principles for Skills

Adapted from the Unix Philosophy (Eric Raymond, "The Art of Unix Programming"). These 17 rules have guided robust software design for 50+ years — they translate directly to AI skill design.

---

## The 17 Rules Applied to Skills

### 1. Rule of Modularity
> Write simple parts connected by clean interfaces.

**Skill Application:**
- One skill = one responsibility
- Skills should be composable, not monolithic
- Clear input (clarifications) → clear output (artifacts)

```
❌ Bad: "full-stack-app-builder" (does everything)
✅ Good: "api-builder" + "frontend-builder" + "deployment-skill" (compose)
```

### 2. Rule of Clarity
> Clarity is better than cleverness.

**Skill Application:**
- Explicit instructions over implicit magic
- Anyone should understand what a skill does by reading SKILL.md
- No hidden assumptions

```
❌ Bad: "Intelligently determine the best approach"
✅ Good: "If async required → use pattern A. If sync → use pattern B."
```

### 3. Rule of Composition
> Design programs to be connected to other programs.

**Skill Application:**
- Skills should produce outputs other skills can consume
- Standard formats (markdown, JSON, YAML)
- No proprietary intermediate states

```
Example: /interview → produces spec → /skill-creator-pro consumes spec
```

### 4. Rule of Separation
> Separate policy from mechanism; separate interfaces from engines.

**Skill Application:**
- **SKILL.md** = Policy (WHAT to do, WHEN to do it)
- **references/** = Mechanism (HOW to do it, domain details)
- User clarifications = Interface
- Embedded knowledge = Engine

```
SKILL.md: "For production deployments, apply security hardening"
references/security.md: Actual hardening steps, checklists, patterns
```

### 5. Rule of Simplicity
> Design for simplicity; add complexity only where you must.

**Skill Application:**
- Start with the minimal viable skill
- Add complexity only when demonstrated necessary
- Fewer clarifications > more clarifications

```
❌ Bad: 15 required clarifications before starting
✅ Good: 3 essential clarifications + sensible defaults
```

### 6. Rule of Parsimony
> Write a big program only when it is clear by demonstration that nothing else will do.

**Skill Application:**
- Don't create a skill for one-off tasks
- Skills exist for recurring patterns
- If unsure, start with documentation, promote to skill later

```
❌ Bad: Creating "deploy-my-specific-app-to-my-specific-cluster" skill
✅ Good: Creating "kubernetes-deployment" skill that handles variations
```

### 7. Rule of Transparency
> Design for visibility to make inspection and debugging easier.

**Skill Application:**
- Skills should explain what they're doing
- Include "Before Implementation" context gathering
- Surface assumptions explicitly

```markdown
## Before Implementation
Gathering context from:
- Codebase: [what was found]
- Conversation: [user requirements]
- References: [patterns applied]
```

### 8. Rule of Robustness
> Robustness is the child of transparency and simplicity.

**Skill Application:**
- Simple + transparent = robust
- Complex + opaque = fragile
- If a skill is hard to debug, it's too complex

### 9. Rule of Representation
> Fold knowledge into data so program logic can be stupid and robust.

**Skill Application:**
- Encode domain expertise in `references/` (data)
- Keep SKILL.md procedural logic simple (stupid)
- The skill reads knowledge, doesn't derive it

```
references/best-practices.md  ← Domain knowledge (rich data)
SKILL.md                      ← Simple: "Apply patterns from references/"
```

**This is why skills have references/ directories.**

### 10. Rule of Least Surprise
> In interface design, always do the least surprising thing.

**Skill Application:**
- Skills should behave predictably
- Same inputs → same behavior
- Follow established conventions

```
❌ Bad: /deploy sometimes creates new clusters, sometimes uses existing
✅ Good: /deploy always uses existing cluster; /cluster-create creates new
```

### 11. Rule of Silence
> When a program has nothing surprising to say, it should say nothing.

**Skill Application:**
- Don't over-explain routine operations
- Report exceptions, not confirmations
- Minimal output when things work

```
❌ Bad: "Successfully read file. Successfully parsed JSON. Successfully..."
✅ Good: [Just produce the result. Report only if something unexpected.]
```

### 12. Rule of Repair
> When you must fail, fail noisily and as soon as possible.

**Skill Application:**
- Validate inputs early
- Clear error messages with remediation
- Don't silently produce bad output

```markdown
## Error Handling

If [condition], STOP and inform user:
"Cannot proceed: [specific issue]. To fix: [specific action]."
```

### 13. Rule of Economy
> Programmer time is expensive; conserve it in preference to machine time.

**Skill Application:**
- Skills save human time (that's the point)
- Automate the tedious, preserve human judgment
- Token cost is acceptable if it saves human effort

```
Trade-off: 2000 tokens to save 30 minutes of human research = worth it
```

### 14. Rule of Generation
> Avoid hand-hacking; write programs to write programs when you can.

**Skill Application:**
- Skills can create skills (meta-capability)
- Templates generate implementations
- `/skill-creator-pro` embodies this rule

```
This rule is why skill-creator-pro exists.
```

### 15. Rule of Optimization
> Prototype before polishing. Get it working before you optimize it.

**Skill Application:**
- First version: make it work
- Second version: make it good
- Don't over-engineer v1

```
Skill development:
1. Minimal SKILL.md that works
2. Add references/ as patterns emerge
3. Optimize based on actual usage
```

### 16. Rule of Diversity
> Distrust all claims for "one true way".

**Skill Application:**
- Multiple valid approaches exist
- Skills should accommodate variation
- "Appropriate Freedom" levels

```markdown
## Flexibility Levels

| Aspect | Freedom |
|--------|---------|
| Architecture | High (user's choice) |
| Security | Low (must follow standards) |
| Naming | Medium (conventions preferred) |
```

### 17. Rule of Extensibility
> Design for the future, because it will be here sooner than you think.

**Skill Application:**
- Build for variations, not single requirements
- Clarifications capture variable elements
- Constants encode patterns that won't change

```
❌ Bad: "Create React component with Tailwind"
✅ Good: "Create UI component" with framework as clarification
```

---

## Quick Reference: Skill Design Checklist

Before finalizing a skill, verify against these principles:

| # | Principle | Check |
|---|-----------|-------|
| 1 | Modularity | Does this skill do ONE thing well? |
| 2 | Clarity | Can someone understand it by reading SKILL.md? |
| 3 | Composition | Can other skills use this skill's output? |
| 4 | Separation | Is policy in SKILL.md, mechanism in references/? |
| 5 | Simplicity | Is this the simplest design that works? |
| 6 | Parsimony | Does this need to be a skill, or just docs? |
| 7 | Transparency | Does the skill explain what it's doing? |
| 8 | Robustness | Is it simple + transparent enough to be robust? |
| 9 | Representation | Is knowledge in data (references/), logic simple? |
| 10 | Least Surprise | Does it behave predictably? |
| 11 | Silence | Does it avoid unnecessary output? |
| 12 | Repair | Does it fail noisily with clear errors? |
| 13 | Economy | Does it save human time? |
| 14 | Generation | Could this generate other artifacts? |
| 15 | Optimization | Is this v1 (working) or vN (polished)? |
| 16 | Diversity | Does it accommodate valid variations? |
| 17 | Extensibility | Is it built for future variations? |

---

## The Meta-Rule

> When in doubt, make it simpler, clearer, and more explicit.

Complexity is easy. Simplicity is hard. Simplicity wins.

---

## Source

These rules are adapted from Eric S. Raymond's "The Art of Unix Programming" (2003), which codified 30+ years of Unix design wisdom. The principles have proven durable because they address fundamental software design tensions that exist regardless of technology.
