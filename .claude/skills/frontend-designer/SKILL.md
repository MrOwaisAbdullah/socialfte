---
name: frontend-architect
description: Create distinctive, production-grade frontend interfaces with high design quality and advanced animation choreography. Use this skill when the user asks to build web components, pages, or applications.
category: frontend
version: 1.1.0
---

This skill guides the creation of distinctive, production-grade frontend interfaces. It mandates **Animation-First Design**, **Separation of Concerns**, and the use of **Model Context Protocol (MCP)** tools to eliminate hallucinations.

## Phase 0: Knowledge Retrieval (MCP MANDATE)

**STOP.** Do not guess API syntax. Before planning, you MUST check if you have access to the following MCP tools. If available, use them:

1.  **Use `shadcn` MCP:**
    - **Action:** Browsing/Installing components.
    - **Why:** Never manually write a shadcn component (like `Button` or `Card`) from memory. Always fetch the latest registry version to ensure correct Tailwind utility classes and ARIA attributes.
2.  **Use `motion` MCP (motion.dev):**
    - **Action:** searching docs for `AnimatePresence`, `layout` props, or `useRef` constraints.
    - **Why:** To ensure you are using the modern "Motion" library syntax, not the outdated "Framer Motion" syntax.
3.  **Use `context7` MCP:**
    - **Action:** Fetching docs for _any_ other library (e.g., `GSAP`, `Three.js`, `Lenis`).
    - **Why:** If the user asks for a specific scrolling library or effect, fetch the documentation _first_ to ensure you don't use deprecated methods.

The user provides frontend requirements: a component, page, application, or interface to build.

## Phase 1: The Design & Motion Choreography (Planning)

**STOP.** Before writing a single line of code, you must act as a **Lead Motion Designer**. AI models suffer from "distributional convergence" (reverting to safe, boring averages). To fight this, you must explicitly plan the timeline.

1.  **Define the "Epicenter of Design":** What is the ONE core interaction that makes this unforgettable?
2.  **Select the Engine:**
    - **Scenario A: Landing Pages / Storytelling / Marketing**
      - **Tool:** GSAP + ScrollTrigger.
      - **Strategy:** "Scroll Storytelling." The user's scrollbar is the timeline. Elements should not just fade in; they should transform, pin, and evolve as the user scrolls.
    - **Scenario B: App UI / Dashboards / Functional Components**
      - **Tool:** Motion.dev (Framer Motion).
      - **Strategy:** "Micro-Interaction." The UI reacts to intent (hover, click, state change). It feels alive and responsive.
3.  **Draft the Choreography Script:**
    - _Example:_ "0-20% Scroll: Hero text explodes character-by-character. 20-50%: The product image pins and rotates 360 degrees while feature cards slide over it..."

## Phase 2: Aesthetic & Visual Direction

Commit to a BOLD aesthetic direction (No "Safe" Choices):

- **Tone:** Pick an extreme: Brutalist/Raw, Maximalist Chaos, Retro-Futuristic, Organic/Natural, Luxury/Refined, Editorial/Magazine.
- **Typography:** **BANNED:** Inter, Roboto, Arial, Open Sans. **REQUIRED:** Distinctive, characterful display fonts paired with clean legible body type.
- **Texture & Depth:** Avoid flat solid colors. Use noise, gradients, blurs, glassmorphism, or grain overlays to create atmosphere.
- **Layout:** Break the grid. Use asymmetry, overlap, diagonal flow, and generous negative space.

## Phase 2.5: Design Tokens & Variable-First Styling

To ensure the UI is maintainable and logically consistent, you MUST use a **Design Token** approach:

1.  **CSS Variables:** Define all core aesthetic properties (primary colors, surface blurs, noise opacity, border-radius) as CSS variables in your global stylesheet.
2.  **Tailwind Extension:** Map these variables into the `tailwind.config.js` theme object.
3.  **Semantic Naming:** Use semantic names like `--brand-epicenter`, `--surface-glass`, `--accent-vibrant` rather than literal names like `--blue-500`.
4.  **BANNED:** Hardcoded hex/rgb codes in component files. Every color must come from the theme or a variable.

## Phase 3: Implementation Rules (The Code)

Implement working code (React, Vue, HTML/CSS) with these specific technical constraints:

- **Shadcn Integration:** If using shadcn components, ensure they are properly wrapped with your motion logic (e.g., wrapping a generic `Card` in a `motion.div`).
- **Performance:** Use `will-change` on animating properties. Avoid layout thrashing.
- **Code Structure:** Keep animation logic (Hooks) separate from markup where possible for readability.

### If using GSAP (Storytelling):

- **ScrollTrigger:** Use `scrub: true` for animations that need to feel tied to the physics of scrolling.
- **Text:** Simulate `SplitText` logic. Animate words or characters individually (staggered) rather than whole blocks.
- **Performance:** Use `will-change` on animating properties. Avoid layout thrashing (animate transforms/opacity, not top/left/width).
- **Pinning:** Use `pin: true` to hold elements in place while others scroll past to create "layered" narratives.

### If using Motion.dev (App UI):

- **Layout:** Use the `layout` prop for magical, smooth resizing when content changes.
- **Presence:** ALWAYS use `<AnimatePresence>` for items leaving the DOM (don't just have them vanish instantly).
- **Simulation:** If building a "Self-Playing Demo" (e.g., a fake cursor using the app), use `useRef` to get the real bounding box of elements so the "cursor" moves to the correct coordinates dynamically.
- **Interaction:** Add `whileHover` and `whileTap` scales to interactive elements (buttons, cards) to give tactile feedback.

## General Frontend Guidelines

- **Production-Grade:** Code must be functional, responsive, and accessible.
- **Tailwind:** Use Tailwind CSS for styling, but extend the config for custom fonts and specific easing curves.
- **Differentiation:** What makes this UNFORGETTABLE? If it looks like a standard Bootstrap/Material UI template, you have failed.

**IMPORTANT:** Match implementation complexity to the aesthetic vision. Don't hold back. Show what can truly be created when thinking outside the box. You are not just a coder; you are a builder using the best tools. Use the MCPs to verify your knowledge, then execute with bold creativity.

---

## Next.js SSR-Safe Patterns

When building for Next.js App Router (server-side rendering), follow these critical patterns to avoid infinite loops and hydration errors:

### The SSR-Safe Component Pattern

**Use this pattern for ANY component that:**
- Uses `localStorage` / `sessionStorage`
- Uses browser APIs (`window`, `document`, `navigator`)
- Uses state management with persistence (Zustand, Redux, etc.)
- Needs to access browser-only data

```typescript
"use client"

import { useState, useEffect } from "react"

export function SSRSafeComponent() {
  const [mounted, setMounted] = useState(false)
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    setMounted(true)

    // ONLY access browser APIs here
    const stored = localStorage.getItem('key')
    if (stored) setValue(JSON.parse(stored))
  }, [])

  // BEFORE mount: render static placeholder (SSR-safe)
  if (!mounted) {
    return <div className="w-10 h-10 bg-muted" />
  }

  // AFTER mount: render full component with browser data
  return <div>{value}</div>
}
```

### Common SSR Errors to Avoid

| Error | Cause | Solution |
|-------|--------|----------|
| "Maximum update depth exceeded" | Zustand persist accessing localStorage during SSR | Use local state + useEffect instead |
| "Rendered more hooks than during the previous render" | Conditional hook calling: `mounted ? useHook() : null` | Never call hooks conditionally |
| "Text content does not match server-rendered HTML" | Browser API accessed during render | Use useEffect for browser-only code |

### Key Rules

1. **NEVER** call hooks conditionally based on `mounted` state
2. **NEVER** use Zustand persist middleware for SSR components
3. **ALWAYS** use `useEffect` for browser APIs
4. **ALWAYS** render static placeholders before client-side mount

---

## TypeScript Best Practices for Production Builds

**CRITICAL**: TypeScript strict mode catches bugs at compile time. Follow these practices to ensure successful production builds on Vercel, Netlify, or any platform.

### Rule 1: Eliminate All Implicit `any` Types

**Problem**: TypeScript's strict mode forbids implicit `any`. Build will FAIL.

```typescript
// ❌ WRONG - Implicit any in parameters
function processTask(task) {  // Error: Parameter 'task' implicitly has 'any' type
  return task.id;
}

const filterItems = items.filter(item => item.active);  // Error: 'item' implicitly 'any'

// ✅ CORRECT - Explicit types
function processTask(task: Task) {
  return task.id;
}

const filterItems = items.filter((item: Item) => item.active);
// OR use type inference from array
const filterItems = items.filter(item => item.active);  // OK if 'items' is typed
```

### Rule 2: Remove All Unused Imports and Variables

**Problem**: TypeScript strict mode (`noUnusedLocals: true`, `noUnusedParameters: true`) will FAIL builds.

```typescript
// ❌ WRONG - Unused imports
import { useState, useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";  // Never used

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => {
    fetchTasks();
  }, []);  // useEffect imported but never used
  return <div>{tasks.map(t => <div key={t.id}>{t.title}</div>)}</div>;
}

// ✅ CORRECT - Remove unused imports
import { useState, useEffect } from "react";

export function TaskList() {
  const [tasks, setTasks] = useState<Task[]>([]);
  useEffect(() => {
    fetchTasks();
  }, []);
  return <div>{tasks.map(t => <div key={t.id}>{t.title}</div>)}</div>;
}
```

### Rule 3: Fix Type Mismatches in Enum Usage

**Problem**: Using string literals where enums are expected causes build failures.

```typescript
// ❌ WRONG - String literal instead of enum value
const getStatusStyle = (status: string) => {
  if (status === "archived") return "gray";  // Type error
};

// ✅ CORRECT - Use enum type
const getStatusStyle = (status: TaskStatus) => {
  const styles: Record<TaskStatus, string> = {
    [TaskStatus.TODO]: "blue",
    [TaskStatus.DOING]: "yellow",
    [TaskStatus.DONE]: "green",
    [TaskStatus.ARCHIVED]: "gray",  // Must include all enum values
  };
  return styles[status];
};
```

### Rule 4: Handle Dynamic Component Rendering Correctly

**Problem**: JSX doesn't allow dynamic component tags like `<ComponentName />`.

```typescript
// ❌ WRONG - JSX treats ComponentName as literal HTML tag
const statusIcon = CheckCircle;
return <div><statusIcon className="w-4 h-4" /></div>;  // Error

// ✅ CORRECT - Use React.createElement or uppercase variable
const statusIcon = CheckCircle;
return <div>{React.createElement(statusIcon, { className: "w-4 h-4" })}</div>;

// OR use uppercase (React convention for components)
const StatusIcon = CheckCircle;
return <div><StatusIcon className="w-4 h-4" /></div>;
```

### Rule 5: Destructure Hooks Correctly

**Problem**: Accessing nested properties that don't exist on hook returns.

```typescript
// ❌ WRONG - Incorrect property access
const { timer, timeEntries } = useTimeTracking();
const elapsed = timer.timer.elapsedSeconds;  // Error: Property 'timer' doesn't exist
const totalTime = timeEntries.totalMinutes;  // Error: Property 'totalMinutes' doesn't exist

// ✅ CORRECT - Destructure correctly
const { timer, timeEntries, totalTime } = useTimeTracking();
const elapsed = timer.elapsedSeconds;  // timer IS the TimerState
```

### Rule 6: Use Type-Only Imports Correctly

**Problem**: Importing types as values when they should be type-only.

```typescript
// ❌ WRONG - Using type-only import as value
import type { UserRole } from "@/types";

if (user.role === UserRole.ADMIN) {  // Error: 'UserRole' cannot be used as a value
  // ...
}

// ✅ CORRECT - Regular import for values used at runtime
import { UserRole } from "@/types";

if (user.role === UserRole.ADMIN) {
  // ...
}
```

### Rule 7: Fix Function Signature Mismatches

**Problem**: Calling functions with wrong number of arguments.

```typescript
// ❌ WRONG - Too many arguments
const timeAgo = formatDistanceToNow(new Date(), { addSuffix: true });
// Error: Expected 1-2 arguments, but got 2 (or similar)

// ✅ CORRECT - Check function signature
const timeAgo = formatDistanceToNow(new Date());  // Often just needs the date
```

### Pre-Build Checklist (Run Before Every Commit)

```bash
# 1. Run TypeScript compiler in strict mode
cd frontend
npx tsc --noEmit --strict

# 2. Run the linter
npm run lint

# 3. Fix ALL errors before committing
# TypeScript errors = build failures in production
```

### Common Build-Failing Errors and Fixes

| Error Message | Cause | Fix |
|---------------|-------|-----|
| `Parameter 'x' implicitly has 'any'` | Missing type annotation | Add explicit type: `(x: Type)` |
| `has no export 'X'` | Wrong import path or non-existent export | Check import path and verify export exists |
| `Property 'X' does not exist` | Type mismatch or wrong property access | Check type definition and fix property name |
| `is declared but its value is never read` | Unused variable/import | Remove unused code |
| `cannot be used as a value` | Type-only import used as value | Change to regular import |
| `JSX element 'component'` | Dynamic component rendering issue | Use `React.createElement()` or uppercase variable |

### Best Practices Summary

1. **Always** run `npx tsc --noEmit` before committing
2. **Never** use `any` type - use `unknown` or proper generics instead
3. **Remove** all unused imports and variables
4. **Type all** function parameters explicitly
5. **Use** `Record<Type, T>` for type-safe object mappings
6. **Import** enums as values, not types
7. **Test** builds locally: `npm run build` must succeed
8. **Enable** strict mode in `tsconfig.json`:
```json
{
  "compilerOptions": {
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

**Remember**: If it compiles locally with strict mode, it will build successfully on Vercel/Netlify. TypeScript errors are your friend - they catch bugs before users do.