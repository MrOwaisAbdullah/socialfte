# Animation Strategies & Implementation Patterns

This resource provides concrete implementation details for the `frontend-architect` skill, specifically regarding the "Animation-First" workflow.

## 1. GSAP ScrollTrigger Patterns (The "Storytelling" Engine)

**Goal:** Create a cinematic experience where the user's scrollbar drives the playback head of the animation.

### Key Concepts
*   **Scrubbing:** Tying the animation directly to the scroll position. `scrub: true` or `scrub: 1` (adds 1s smoothing).
*   **Pinning:** Freezing an element in the viewport while others scroll past (or while an animation plays inside it). `pin: true`.
*   **Timelines:** Sequencing multiple animations that play relative to each other as the user scrolls through a single "section".

### Best Practice Implementation (React/GSAP)

Use the modern `useGSAP` hook for automatic cleanup and React 18+ compatibility.

```javascript
import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(useGSAP, ScrollTrigger);

export function HeroScrollStory() {
  const container = useRef(null);
  const textRef = useRef(null);

  useGSAP(() => {
    const tl = gsap.timeline({
      scrollTrigger: {
        trigger: container.current, // Use the scope/container as trigger
        start: "top top",
        end: "+=300%", // Scroll distance (3x height)
        scrub: 1, // Smooth scrubbing
        pin: true, // Pin the container
      },
    });

    // 1. Text explodes
    tl.from(textRef.current, { scale: 0.1, opacity: 0, duration: 1 })
    // 2. Text rotates and fades out
      .to(textRef.current, { rotation: 360, opacity: 0, duration: 1 });

  }, { scope: container }); // Automatic selector scoping & cleanup

  return (
    <div ref={container} className="h-screen flex items-center justify-center bg-black text-white overflow-hidden">
      <h1 ref={textRef} className="text-9xl font-bold">EPIC</h1>
    </div>
  );
}
```

## 2. Motion.dev Patterns (The "App" Engine)

**Goal:** Create a responsive, tactile interface that feels alive.

### Key Concepts
*   **Layout Animations:** Automatically animating position/size changes when the DOM layout shifts. `<motion.div layout />`.
*   **Shared Layout:** Animating an element from one container to another (e.g., a "selected" tab background).
*   **Gestures:** `whileHover`, `whileTap`, `whileDrag`.

### Best Practice Implementation (Self-Playing Demo)

Simulating a cursor interaction using `useRef` for coordinate mapping (as recommended for "demo" modes).

```javascript
import { motion, useAnimate } from "motion/react";
import { useEffect, useRef } from "react";

export function AutoDemo() {
  const [scope, animate] = useAnimate();
  const buttonRef = useRef(null);

  useEffect(() => {
    const playDemo = async () => {
      // 1. Get real coordinates of the button
      const buttonRect = buttonRef.current.getBoundingClientRect();
      
      // 2. Move "cursor" to button
      await animate("#cursor", { 
        x: buttonRect.left + buttonRect.width / 2, 
        y: buttonRect.top + buttonRect.height / 2 
      }, { duration: 1 });

      // 3. Simulate "Click" (scale down button)
      await animate(buttonRef.current, { scale: 0.9 }, { duration: 0.1 });
      await animate(buttonRef.current, { scale: 1 }, { duration: 0.1 });
    };

    playDemo();
  }, []);

  return (
    <div ref={scope} className="relative p-10 min-h-[300px] border rounded-lg">
      <div id="cursor" className="absolute w-4 h-4 bg-red-500 rounded-full pointer-events-none z-50 top-0 left-0" />
      <button ref={buttonRef} className="bg-blue-500 text-white px-4 py-2 rounded mt-20 ml-20">
        Click Me
      </button>
    </div>
  );
}
```

## 3. "Distributional Convergence" Checklist

Before finalizing any design, verify:

1.  [ ] **No Fades:** Did you just put `opacity: 0` -> `opacity: 1`? **REJECT.** Add scale, blur, or staggering.
2.  [ ] **No Arial/Inter:** Are you using a system font? **REJECT.** Import a display font.
3.  [ ] **No Static Grids:** Is it just rows and columns? **REJECT.** Add overlap or offset.