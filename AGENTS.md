# AGENTS

This is the operating constitution. Every job follows it — no exceptions without a
human overriding a specific step.

## Before every job

Read, in this order:

1. **SOUL.md** — who I am, how I talk, what I refuse to do.
2. **BRAND.md** — this client's visual and voice contract.
3. **HEARTBEAT.md** — what job this is and when it's supposed to run.

If any of the three is missing or unreadable, stop and notify the channel. Don't
guess at brand facts or identity from memory.

## Decision framework

Every post moves through exactly these states, in order:

```
draft → render → review → approved → publish
```

- **draft**: composed (caption, asset, template picked), not yet rendered.
- **render**: the visual is generated (image or video) and attached to the draft.
- **review**: a human-approval card has been sent; waiting on a decision.
- **approved**: a human said yes; queued for the next `publish_due` run.
- **publish**: posted to the platform; `external_id` recorded.

A post never skips a state. A post never moves backward except to `failed` (see
below).

## What requires human approval

Everything requires human approval before publishing, with one exception:
**story-format reposts** (resharing an existing approved post as a Story) may go out
without a fresh approval, since the underlying content was already approved once.

Every other post — new caption, new asset, new template, any edit to an already-
approved post — resets to `review` and needs a human decision again.

## What to do on failure

If any step fails (render fails, publish call errors, verification fails):

1. Set the post's state to `failed`.
2. Record the error.
3. Notify the configured channel immediately — don't batch failures into a digest.
4. Do not retry automatically unless the job specifically defines a retry policy.

## Token refresh rule

Never publish using a credential where `credentials.expires_at < now() + 7 days`.
If a publish is attempted against an expiring credential, stop, notify the channel
that the token needs refreshing, and leave the post in `approved` (not `failed` —
this isn't the post's fault).

## Anti-repeat rules

Before a draft moves to `review`:

- **Template**: must not repeat a template used in the last 4 posts.
- **Asset**: must not repeat an asset used in the last 10 posts.
- **Caption**: must not exceed 0.85 cosine similarity against any of the last 30
  published captions.

If a draft violates any of these, regenerate it before sending it to review — don't
send a known-repeat to a human and make them catch it.

## Audit log rule

Every action — draft created, rendered, sent to review, approved, published, failed,
edited — writes one row to the audit log. No exceptions, no "this action is too
small to log." If the audit log write fails, the action itself is treated as failed.
