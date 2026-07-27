"""Anti-repeat gate — Week 4, Step 4.

Not an LLM agent (see brain/ for those) — this is a set of DB-query gates that
compose_batch calls before accepting a template, asset, or caption. Kept in its own
package specifically so "queries Postgres" and "calls an LLM" aren't conflated in
the same module (plan.md Phase 4).
"""
