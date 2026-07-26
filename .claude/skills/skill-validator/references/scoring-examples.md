# Scoring Examples

Calibration examples showing how to score skills consistently.

---

## Example 1: Production-Level Skill

**Skill**: chatgpt-widget-creator
**Type**: Builder

### Category Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Structure & Anatomy | 95/100 | 12% | 11.40 |
| Content Quality | 90/100 | 15% | 13.50 |
| User Interaction | 95/100 | 12% | 11.40 |
| Documentation | 100/100 | 10% | 10.00 |
| Domain Standards | 90/100 | 10% | 9.00 |
| Technical Robustness | 75/100 | 8% | 6.00 |
| Maintainability | 85/100 | 8% | 6.80 |
| Zero-Shot Implementation | 90/100 | 12% | 10.80 |
| Reusability | 85/100 | 13% | 11.05 |
| **Total** | | | **89.95** |

**Rating**: Good (borderline Production)

### Breakdown

**Structure & Anatomy (95/100)**:
- SKILL.md exists: 3
- Line count (262): 3
- Frontmatter: 3 (complete with triggers)
- No extraneous files: 3
- Progressive disclosure: 3 (6 reference files)
- Asset organization: 3 (templates in assets/)

**Content Quality (90/100)**:
- Conciseness: 3 (lean, table-driven)
- Imperative form: 3
- Appropriate freedom: 3 (Required + Optional)
- Scope clarity: 2 (could add "What this does NOT do")
- Output specification: 3 (full checklist)

**User Interaction (95/100)**:
- Clarification triggers: 3 ("STOP: Clarify Before Building")
- Required vs optional: 3 (clearly separated)
- Graceful handling: 2 (missing "if user declines")
- Context awareness: 3

**Documentation (100/100)**:
- Source URLs: 3 (8 official links in table)
- Reference files: 3 (6 topical files)
- Fetch guidance: 3 ("fetch from docs" instruction)
- Version awareness: 3
- Example coverage: 3 (templates provided)

**Domain Standards (90/100)**:
- Best practices: 3 (UX Principles section)
- Enforcement mechanism: 3 (checkbox checklist)
- Anti-patterns: 3 ("Must Avoid" section)
- Quality gates: 2 (good but could be stricter)

**Technical Robustness (75/100)**:
- Error handling: 2 (states in checklist)
- Security: 2 (CSP mentioned, basic)
- Dependencies: 2 (implicit)
- Edge cases: 2 (some covered)
- Testability: 2 (mock pattern provided)

**Maintainability (85/100)**:
- Modularity: 3 (self-contained refs)
- Update path: 3 (fetch pattern)
- Clear organization: 2 (good, minor flow issues)

**Zero-Shot Implementation (90/100)**:
- Before Implementation section: 3 (context gathering present)
- Codebase context: 3 (scans existing patterns)
- Conversation context: 3 (uses discussed requirements)
- Embedded expertise: 3 (domain knowledge in references)
- User-only questions: 2 (mostly asks user requirements)

**Reusability (85/100)**:
- Handles variations: 3 (adaptable to widget types)
- Variable elements: 3 (clarifications capture variations)
- Constant patterns: 3 (UX best practices encoded)
- Not requirement-specific: 2 (some ChatGPT-specific)
- Abstraction level: 2 (appropriate for widget domain)

---

## Example 2: Adequate Skill (Needs Work)

**Skill**: hypothetical-basic-skill
**Type**: Guide

### Category Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Structure & Anatomy | 60/100 | 12% | 7.20 |
| Content Quality | 55/100 | 15% | 8.25 |
| User Interaction | 30/100 | 12% | 3.60 |
| Documentation | 40/100 | 10% | 4.00 |
| Domain Standards | 50/100 | 10% | 5.00 |
| Technical Robustness | 45/100 | 8% | 3.60 |
| Maintainability | 50/100 | 8% | 4.00 |
| Zero-Shot Implementation | 35/100 | 12% | 4.20 |
| Reusability | 40/100 | 13% | 5.20 |
| **Total** | | | **45.05** |

**Rating**: Developing

### Key Issues

- **Structure**: 450 lines (borderline), README.md exists
- **Content**: Verbose, mixed imperative form
- **User Interaction**: "Ask if needed" without specifics
- **Documentation**: One link buried in text
- **Domain Standards**: Mentions best practices without enforcement
- **Technical**: "Handle errors" without specifics
- **Maintainability**: Everything in one file
- **Zero-Shot**: No "Before Implementation" section, expects runtime discovery
- **Reusability**: Hardcoded to single use case, no variation handling

---

## Example 3: Incomplete Skill

**Skill**: hypothetical-minimal-skill

```yaml
---
name: do-stuff
description: Does stuff
---

# Do Stuff

This skill does stuff with things.

## Usage
Just ask it to do stuff.
```

### Category Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Structure & Anatomy | 40/100 | 12% | 4.80 |
| Content Quality | 20/100 | 15% | 3.00 |
| User Interaction | 0/100 | 12% | 0.00 |
| Documentation | 0/100 | 10% | 0.00 |
| Domain Standards | 0/100 | 10% | 0.00 |
| Technical Robustness | 0/100 | 8% | 0.00 |
| Maintainability | 20/100 | 8% | 1.60 |
| Zero-Shot Implementation | 0/100 | 12% | 0.00 |
| Reusability | 10/100 | 13% | 1.30 |
| **Total** | | | **10.70** |

**Rating**: Incomplete

---

## Example 4: Official skill-creator (Honest Assessment)

**Skill**: skill-creator (Anthropic official)
**Type**: Guide

### Category Scores

| Category | Score | Weight | Weighted |
|----------|-------|--------|----------|
| Structure & Anatomy | 90/100 | 12% | 10.80 |
| Content Quality | 95/100 | 15% | 14.25 |
| User Interaction | 50/100 | 12% | 6.00 |
| Documentation | 30/100 | 10% | 3.00 |
| Domain Standards | 40/100 | 10% | 4.00 |
| Technical Robustness | 50/100 | 8% | 4.00 |
| Maintainability | 85/100 | 8% | 6.80 |
| Zero-Shot Implementation | 60/100 | 12% | 7.20 |
| Reusability | 70/100 | 13% | 9.10 |
| **Total** | | | **65.15** |

**Rating**: Adequate

### Honest Breakdown

**Structure & Anatomy (90/100)** - Excellent:
- 357 lines (well under 500)
- Complete frontmatter
- 2 reference files
- No extraneous files

**Content Quality (95/100)** - Excellent:
- Very concise
- Consistent imperative form
- Clear 6-step workflow
- Good appropriate freedom guidance

**User Interaction (50/100)** - Gaps:
- Step 1 mentions asking users questions during skill creation process
- But no structured "Required Clarifications" pattern
- No guidance on context awareness
- Missing "what if user doesn't answer"

**Documentation (30/100)** - Missing:
- No official documentation links
- No fetch guidance for unlisted scenarios
- References exist but no external sources
- No version awareness

**Domain Standards (40/100)** - Partial:
- Has output-patterns.md reference
- But no enforcement checklist
- No "Must Follow / Must Avoid" pattern
- No quality gates before delivery

**Technical Robustness (50/100)** - Partial:
- Scripts mentioned with testing requirement
- But no error handling guidance
- No security considerations
- Dependencies implicit

**Maintainability (85/100)** - Good:
- Modular references
- Clear organization
- But no update path guidance

**Zero-Shot Implementation (60/100)** - Partial:
- Has workflow guidance but no explicit "Before Implementation" section
- Codebase context partially addressed
- Embedded expertise in references but could be more comprehensive
- Some runtime discovery expected

**Reusability (70/100)** - Moderate:
- Handles skill creation variations
- Variable elements mostly captured
- Could be more abstract in some areas
- Works across skill types

### Improvement Recommendations for skill-creator

1. **High Priority**: Add official documentation links (if Anthropic has docs)
2. **High Priority**: Add structured clarification questions pattern
3. **Medium Priority**: Add "Must Follow / Must Avoid" enforcement pattern
4. **Medium Priority**: Add output checklist / quality gate
5. **Low Priority**: Add error handling guidance for scripts
6. **Low Priority**: Add update path / version awareness

**Note**: This is an honest assessment. Even official skills can have room for improvement to reach production-level standards.

---

## Calibration Notes

### Common Scoring Mistakes

1. **Over-scoring structure**: A skill with clean structure but no content shouldn't score high overall

2. **Under-scoring interaction**: Missing clarification patterns is a major gap for builder skills

3. **Ignoring domain specificity**: A widget skill without UX standards is incomplete; a data skill without validation patterns is incomplete

4. **Binary scoring**: Use the full 0-3 range, not just 0 or 3

### Skill Type Adjustments

**Builder Skills** (create artifacts):
- User Interaction weight: Higher importance
- Documentation weight: Higher importance
- Clarification questions: Essential

**Automation Skills** (run workflows):
- Technical Robustness: Higher importance
- Error handling: Critical
- User Interaction: Lower unless ambiguous inputs

**Guide Skills** (provide instructions):
- Content Quality: Higher importance
- Documentation: Higher importance
- User Interaction: Medium (depends on complexity)
