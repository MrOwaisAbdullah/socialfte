# Skill Validation Checklist

**Every skill must pass this before delivery.**

## 1. Deployment Tested

```bash
# For infrastructure skills:
[ ] make install succeeds
[ ] make test passes
[ ] make uninstall cleans up

# Versions verified against latest:
[ ] Tool versions current (not 6 months old)
[ ] No deprecated APIs
```

## 2. Real Scenario Tested

```bash
# Skill must answer domain questions, not just deploy tools
[ ] Given a realistic scenario, skill provides correct analysis
[ ] Skill explains WHY, not just HOW

# Example test for Kafka skill:
Scenario: "Service A calls B, C, D directly at 500ms each"
Expected: Skill identifies temporal, availability, behavioral coupling
```

## 3. No Over-Engineering

```bash
[ ] Uses native tools (Helm, kubectl, make) not wrappers
[ ] No Python scripts shelling out to CLI tools
[ ] No "Virtual Employee graduation framework" complexity
[ ] SKILL.md < 200 lines
```

## 4. Battle-Tested Assets

```bash
# assets/ directory contains ONLY:
[ ] Code that has been executed successfully
[ ] Manifests that have been applied to real clusters
[ ] Templates with correct versions

# NOT:
[ ] Generated-but-untested code
[ ] Copy-pasted examples from docs
[ ] Outdated version numbers
```

## 5. Domain Knowledge Included

```bash
# Skill must answer:
[ ] WHEN to use this tool (not just HOW)
[ ] WHY this pattern vs alternatives
[ ] What PROBLEMS does this solve

# Check for these sections:
[ ] Architecture patterns / decision guidance
[ ] Anti-patterns to avoid
[ ] Trade-offs documented
```

## 6. Failure Mode Handling

```bash
[ ] What happens when X fails?
[ ] Debugging runbooks included
[ ] Common mistakes documented with prevention
```

---

## Quick Validation Command

```bash
# Run this before delivering any skill:
cd skill-directory/

# 1. Check deployment
make test || echo "FAIL: Deployment not tested"

# 2. Check knowledge depth
grep -r "when to use\|why\|coupling\|trade-off" references/ || echo "FAIL: No architectural knowledge"

# 3. Check simplicity
wc -l SKILL.md | awk '{if ($1 > 200) print "WARN: SKILL.md too long"}'

# 4. Check assets tested
ls assets/ && echo "Verify each asset was actually executed"
```

---

## Pre-Delivery Certification

Before marking skill complete:

```markdown
## Validation Report

- [ ] `make test` passed on: [date]
- [ ] Tested against scenario: [describe]
- [ ] Versions verified: [list tools + versions]
- [ ] Assets executed: [yes/no]
- [ ] Domain knowledge: WHY covered, not just HOW
```
