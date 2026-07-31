# Creative Pipeline Migration Guide

## Phase 1 Implementation Complete ✅

### What's Been Deployed

1. **Database Schema** (`apps/worker/db/schema_concepts.sql`)
   - `concepts` table for storing creative variations
   - `content_library` table for reusable content snippets
   - `concept_performance` table for A/B testing data

2. **Concepts Job** (`apps/worker/jobs/create_concepts.py`)
   - Generates 5 headline variations per concept
   - Creates 3 caption options per concept
   - Supports 5 marketing angles: price-focused, lifestyle, quality, exclusive, comfort
   - Suggests templates and animation styles

3. **Database Models** (`apps/worker/db/models.py`)
   - Added `Concept` model with full relationship support
   - Ready for integration into compose_batch

### How to Run the Migration

```bash
# Connect to your Neon database
psql $DATABASE_URL

# Run the schema migration
\i apps/worker/db/schema_concepts.sql

# Verify tables created
\dt concepts
\dt content_library
\dt concept_performance

# Check sample data was inserted
SELECT * FROM content_library LIMIT 5;
```

### How to Test the Concepts Job

```bash
cd apps/worker

# Run the concepts job manually
python -m jobs.create_concepts

# Check the logs for generated concepts
# You should see: "Created concept abc12345 for asset def67890: quality (5 headlines, 3 captions)"
```

### What You'll See

After running the job, you'll have:
- **3-5 headline variations** per asset (e.g., "Handcrafted sheesham, built to last", "Luxury within reach")
- **3 caption options** per concept with different marketing angles
- **Template suggestions** (hero, price-card, etc.)
- **Animation style suggestions** for enhanced reels

### Next Steps (Phase 2)

1. **Create Concept Review UI** in dashboard
   - Show draft concepts waiting for approval
   - Allow selection of best headlines/captions
   - Enable bulk approval

2. **Update compose_batch** to use approved concepts
   - Pick from approved concepts instead of generating on-the-fly
   - Track which concepts perform best

3. **Build Enhanced Reels** with scroll animations
   - Integrate scroll-story-3d techniques
   - Support multi-headline/image sequences

### Example Usage

**Before (Current):**
```
Worker: Generate caption for sheesham bed
AI: "Premium sheesham bed, comfort meets elegance ✨"
Post: Created with single option
```

**After (Phase 1):**
```
Concepts Job: Generate concepts for sheesham bed
→ Created 5 headlines: ["Handcrafted sheesham", "Luxury within reach", ...]
→ Created 3 captions with different angles
→ Suggested hero template with frame-sequence animation

Human Review: Approve best options
Compose: Use approved concept to create post
```

### Expected Benefits

- **Quality**: Human-reviewed creative vs AI on-the-fly
- **Variety**: 5 headline options per asset vs 1
- **Consistency**: Planned messaging across posts  
- **A/B Testing**: Track which concepts perform best
- **Time-Saving**: Reuse concepts instead of regenerating

### Rollback Plan

If needed, rollback is simple:
```sql
DROP TABLE IF EXISTS concept_performance;
DROP TABLE IF EXISTS concepts;
DROP TABLE IF EXISTS content_library;
```

The system will continue working with the current compose_batch flow.

## Status: Ready for Migration ✅

Run the migration and test the concepts job. Let me know when you're ready for Phase 2 (dashboard UI + compose integration)!
