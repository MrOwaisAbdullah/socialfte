# Frontend Design Patterns (Next.js 16 + shadcn/ui)

## Distinctive Aesthetics

To avoid the "default AI/corporate" look, leverage shadcn/ui's flexibility with these principles:

### 1. Minimalist & Clean
- **Whitespace**: Use generous whitespace (`p-8`, `gap-8`) to let content breathe.
- **Typography**: Pair a distinctive header font (e.g., *Clash Display*, *Space Grotesk*) with a clean body font (*Geist*, *Inter*).
- **Depth**: Use subtle shadows (`shadow-sm`, `shadow-md`) to create depth without skeuomorphism.

### 2. "Black Shirt" Philosophy
- Start with a neutral, timeless foundation (slate/zinc/stone colors).
- Layer unique brand identity through specific accent colors and radius tokens.
- Avoid over-styling; let the content be the hero.

### 3. Micro-Interactions
- **Feedback**: Add hover states (`hover:bg-accent`) and active states (`active:scale-95`) to all interactive elements.
- **Motion**: Use `framer-motion` or `tailwindcss-animate` for subtle entrance animations (fade-in, slide-up).

## Shadcn/ui Customization

### Theming via CSS Variables
Modify `app/globals.css` to define your brand identity:

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 221.2 83.2% 53.3%; /* Distinctive blue */
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 221.2 83.2% 53.3%;
    --radius: 0.5rem; /* Rounded vs sharp corners */
  }
}
```

### Component Composition
Combine atomic components to build complex, reusable patterns:

```tsx
// components/user-card.tsx
import { Card, CardHeader, CardContent } from "@/components/ui/card"
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar"

export function UserCard({ user }) {
  return (
    <Card className="hover:shadow-lg transition-shadow duration-200">
      <CardHeader className="flex flex-row items-center gap-4">
        <Avatar>
          <AvatarImage src={user.image} />
          <AvatarFallback>{user.initials}</AvatarFallback>
        </Avatar>
        <div>
          <h3 className="text-lg font-semibold">{user.name}</h3>
          <p className="text-sm text-muted-foreground">{user.role}</p>
        </div>
      </CardHeader>
      <CardContent>
        {/* Content */}
      </CardContent>
    </Card>
  )
}
```

## Layout Patterns

### Bento Grid
Use CSS Grid for dense, information-rich dashboards:

```tsx
<div className="grid grid-cols-1 md:grid-cols-3 gap-4">
  <Card className="md:col-span-2">...</Card>
  <Card className="md:col-span-1">...</Card>
  <Card className="md:col-span-3">...</Card>
</div>
```

### Sidebar Layout
Use a fixed sidebar for navigation and a scrollable main area:

```tsx
<div className="flex h-screen overflow-hidden">
  <aside className="w-64 border-r bg-muted/40 hidden md:block">
    {/* Navigation */}
  </aside>
  <main className="flex-1 overflow-y-auto p-8">
    {children}
  </main>
</div>
```

## Visual Excellence Workflow

To achieve a truly "Bold & Tactile" aesthetic, combine this skill with:

### 1. `frontend-designer` (Animation & Choreography)
Use this skill to plan the "Epicenter of Design" and animation choreography. It provides:
- **GSAP/Motion.dev Strategies**: "Scroll Storytelling" vs. "Micro-Interactions".
- **Design Tokens**: Semantic naming strategies (`--brand-epicenter` vs `--blue-500`).
- **Distributional Convergence Checks**: Ensures you aren't building "boring" UI.

### 2. `theme-factory` (Color Palettes)
Don't guess hex codes. Use `theme-factory` to generate professional, accessible color themes (e.g., "Ocean Depths", "Midnight Galaxy") and apply them to your `globals.css` variables.

### 3. `gemini-frontend-assistant` (Code Generation)
Use this skill for:
- **Screenshot-to-Code**: Convert design mockups directly into React/Tailwind components.
- **Complex Refactoring**: Ask it to "Refactor this component to use the glass-bar utility class."

