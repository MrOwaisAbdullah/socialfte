# Creative Pipeline Plan

## Overview
Separate creative planning from post composition for higher quality, consistency, and A/B testing capability.

## Phase 1: Concepts Job (`create_concepts`)

### Purpose
Generate creative concepts, headlines, captions in advance of posting

### Database Schema Additions
```sql
CREATE TABLE concepts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id UUID REFERENCES assets(id),
  concept_type TEXT NOT NULL, -- 'price-focused', 'lifestyle', 'quality', 'exclusive'
  headlines JSONB NOT NULL, -- ["Premium comfort", "Luxury within reach", "Best value"]
  captions JSONB NOT NULL, -- ["Option 1", "Option 2", "Option 3"]
  creative_direction TEXT, -- "Focus on craftsmanship", "Emphasize savings"
  suggested_templates TEXT[], -- ['hero', 'price-card', 'carousel-slide']
  animation_style TEXT, -- 'frame-sequence', 'shader-dissolve', 'card-convergence'
  state TEXT DEFAULT 'draft', -- draft, approved, rejected
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

CREATE TABLE content_library (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_type TEXT NOT NULL, -- 'headline', 'caption', 'angle'
  category TEXT NOT NULL, -- 'quality', 'price', 'luxury', 'lifestyle'
  content TEXT NOT NULL,
  tags TEXT[],
  usage_count INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT now()
);
```

### Job Logic
1. Select assets needing concepts (new assets, under-represented categories)
2. Generate 3-5 headline variations per asset
3. Generate 3 caption options per concept
4. Suggest templates and animation styles
5. Store for human review/approval
6. Approved concepts feed compose_batch

## Phase 2: Enhanced Compose Job

### Current Flow
```
compose_batch → generate caption → render → post
```

### Enhanced Flow
```
concepts_job → store concepts → compose_batch → use approved concepts → render → post
```

### Benefits
- Higher quality (pre-approved creative)
- Consistency (planned messaging)
- A/B testing (multiple headline options)
- Human oversight (creative review step)

## Phase 3: Enhanced Reels with Scroll Animations

### Animation Techniques (from scroll-story-3d skill)

#### 1. Frame-Sequence Scrubbing
- **Best for**: Product reveal reels
- **Effect**: Product floats → explodes/opens → rebuilds
- **Use case**: "Watch how this chair is made"
- **Multi-headline**: "Premium comfort" → "Handcrafted details" → "Built to last"

#### 2. Shader Dissolve  
- **Best for**: Collection showcases
- **Effect**: Cross-fade between product angles with edge glow
- **Use case**: "See every angle" 
- **Multi-image**: Front view → side view → detail shot

#### 3. Card Convergence
- **Best for**: Set/group displays  
- **Effect**: Scattered cards converge to center
- **Use case**: "Complete bedroom set"
- **Multi-product**: Individual items → full set reveal

### Enhanced Reel Composition
```python
async def build_enhanced_reel_props(concept_id, asset_id, extra_assets):
    concept = await get_concept(concept_id)
    
    return {
        "composition_id": "FrameSequenceReveal", # or "ShaderDissolve", "CardConvergence"
        "headline_sequence": concept.headlines, # Multiple headlines for animation
        "images": [asset_id] + extra_assets, # Multiple images for transitions
        "animation_style": concept.animation_style,
        "transition_points": [0.3, 0.6, 0.9], # When to switch headlines/images
        "scroll_speed": "medium", # Control animation pace
    }
```

## Implementation Priority

### Phase 1 (Immediate)
1. Create concepts database table
2. Build concepts_job using AI to generate variations
3. Human review UI for concept approval

### Phase 2 (Week 2)  
1. Modify compose_batch to use approved concepts
2. Add concept selection logic (A/B test ready)
3. Track concept performance metrics

### Phase 3 (Week 3-4)
1. Integrate scroll-story-3d animations
2. Build enhanced reel composition
3. Add multi-headline/image support

## Example Flow

### Before (Current)
```
Worker: "Generate caption for sheesham bed"
AI: "Premium sheesham bed, comfort meets elegance ✨"
Worker: Render post with single headline
```

### After (Enhanced)
```
Concepts Job (Sunday):
  - Generate 5 headline options
  - Generate 3 caption options  
  - Suggest animation style: "frame-sequence"
  - Store for review

Human Review:
  - Approve best headline: "Handcrafted sheesham, built to last"
  - Approve caption option 2
  - Approve animation style

Compose Batch (Daily):
  - Use approved concept
  - Generate multi-headline reel
  - Apply scroll animation
```

## Technical Requirements

### New Files
- `apps/worker/jobs/create_concepts.py` - Concepts generation job
- `apps/worker/enhanced_compose.py` - Enhanced reel composition
- `apps/dashboard/pages/concepts-review.tsx` - Concept review UI

### Dependencies
- scroll-story-3d skill for animations
- Enhanced Remotion compositions supporting multi-headline/images
- Concept performance tracking

## Success Metrics
- Concept approval rate (>80% = good)
- Post engagement improvement
- A/B test performance tracking
- Reduced creative generation time (concepts reused)
