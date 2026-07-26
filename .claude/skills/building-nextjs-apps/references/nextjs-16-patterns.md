# Next.js 16 Patterns

## Critical Breaking Changes (Next.js 16)

### 1. params and searchParams are Now Promises

**THIS IS THE MOST COMMON MISTAKE.**

```typescript
// WRONG - Next.js 15 pattern (WILL FAIL)
export default function Page({ params }: { params: { id: string } }) {
  return <div>ID: {params.id}</div>
}

// CORRECT - Next.js 16 pattern
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  return <div>ID: {id}</div>
}
```

### 2. Client Components Need use() Hook

```typescript
"use client"
import { use } from "react"

export default function ClientPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = use(params)
  return <div>ID: {id}</div>
}
```

### 3. searchParams Also Async

```typescript
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const { page } = await searchParams
  return <div>Page: {page ?? "1"}</div>
}
```

## Core Patterns

### Project Setup

```bash
npx create-next-app @latest my-app --typescript --tailwind --eslint
cd my-app

# Add shadcn/ui
npx shadcn @latest init
npx shadcn @latest add button form dialog table sidebar
```

### App Router Layout

```typescript
// app/layout.tsx
export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        {children}
      </body>
    </html>
  )
}
```

### Dynamic Routes

```typescript
// app/tasks/[id]/page.tsx
export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const task = await getTask(id)

  return (
    <main>
      <h1>{task.title}</h1>
    </main>
  )
}
```

### Server Actions

```typescript
// app/actions.ts
"use server"

import { revalidatePath } from "next/cache"

export async function createTask(formData: FormData) {
  const title = formData.get("title") as string

  await db.insert(tasks).values({ title })

  revalidatePath("/tasks")
}

// Usage in component
<form action={createTask}>
  <input name="title" />
  <button type="submit">Create</button>
</form>
```

### API Routes

```typescript
// app/api/tasks/route.ts
import { NextResponse } from "next/server"

export async function GET() {
  const tasks = await db.select().from(tasksTable)
  return NextResponse.json(tasks)
}

export async function POST(request: Request) {
  const body = await request.json()
  const task = await db.insert(tasksTable).values(body).returning()
  return NextResponse.json(task, { status: 201 })
}
```

### Middleware → proxy.ts

```typescript
// proxy.ts (replaces middleware.ts in Next.js 16)
import { NextRequest } from "next/server"

export function proxy(request: NextRequest) {
  // Authentication check
  const token = request.cookies.get("token")
  if (!token && request.nextUrl.pathname.startsWith("/dashboard")) {
    return Response.redirect(new URL("/login", request.url))
  }
}

export const config = {
  matcher: ["/dashboard/:path*"],
}
```

## Data Fetching

### Server Component (Default)

```typescript
// This runs on the server - can use async/await directly
async function TaskList() {
  const tasks = await fetch("https://api.example.com/tasks", {
    cache: "no-store", // SSR, or
    // next: { revalidate: 60 } // ISR
  }).then(r => r.json())

  return (
    <ul>
      {tasks.map(task => <li key={task.id}>{task.title}</li>)}
    </ul>
  )
}
```

### Client Component

```typescript
"use client"

import useSWR from "swr"

const fetcher = (url: string) => fetch(url).then(r => r.json())

export function ClientTaskList() {
  const { data, error, isLoading } = useSWR("/api/tasks", fetcher)

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error loading tasks</div>

  return (
    <ul>
      {data.map(task => <li key={task.id}>{task.title}</li>)}
    </ul>
  )
}
```

## Project Structure

```
app/
├── layout.tsx           # Root layout
├── page.tsx             # Home page
├── globals.css          # Global styles
├── api/                 # API routes
│   └── tasks/route.ts
├── tasks/
│   ├── page.tsx         # /tasks
│   └── [id]/page.tsx    # /tasks/:id
├── actions.ts           # Server actions
└── proxy.ts             # Request proxy (middleware)
components/
├── ui/                  # shadcn/ui components
└── task-list.tsx        # App components
lib/
├── db.ts                # Database connection
└── utils.ts             # Utilities
```

## Critical SSR Pitfalls ⚠️

### 1. Zustand + Persist Middleware = Infinite Loop

**Problem**: Using Zustand with `persist` middleware causes "Maximum update depth exceeded" and "The result of getServerSnapshot should be cached to avoid an infinite loop" errors during SSR.

**Why**: The persist middleware tries to access `localStorage` synchronously during server-side rendering, which doesn't exist on the server.

**❌ WRONG - Conditional hook calling (violates Rules of Hooks)**:
```typescript
"use client"
import { useSidebar } from "@/lib/store"
import { useState } from "react"

export function Sidebar() {
  const [mounted, setMounted] = useState(false)

  // VIOLATES Rules of Hooks!
  const sidebarStore = mounted ? useSidebar() : null

  // Causes: "Rendered more hooks than during the previous render"
}
```

**✅ CORRECT - Local state with localStorage sync**:
```typescript
"use client"
import { useState, useEffect } from "react"

export function Sidebar() {
  const [mounted, setMounted] = useState(false)
  const [isCollapsed, setIsCollapsed] = useState(false)

  useEffect(() => {
    setMounted(true)

    // Read from localStorage only on client
    const stored = localStorage.getItem('teamflow-ui-storage')
    if (stored) {
      try {
        const parsed = JSON.parse(stored)
        if (parsed?.state?.isCollapsed !== undefined) {
          setIsCollapsed(parsed.state.isCollapsed)
        }
      } catch (e) {
        // Use default
      }
    }
  }, [])

  // Don't use Zustand store at all - manage state locally
  const toggleSidebar = () => {
    const newCollapsed = !isCollapsed
    setIsCollapsed(newCollapsed)

    // Update localStorage directly
    const stored = localStorage.getItem('teamflow-ui-storage')
    let data = {}
    if (stored) {
      try {
        data = JSON.parse(stored)
      } catch (e) {}
    }
    data = { ...data, state: { ...data.state, isCollapsed: newCollapsed } }
    localStorage.setItem('teamflow-ui-storage', JSON.stringify(data))
  }

  // Render static placeholder during SSR
  if (!mounted) {
    return <div>Sidebar placeholder</div>
  }

  return <aside>...</aside>
}
```

**Key Takeaways**:
- **NEVER** call Zustand hooks conditionally based on `mounted` state
- **NEVER** use Zustand persist middleware for state needed during SSR
- **USE** local `useState` for SSR-safe state management
- **SYNC** with localStorage in `useEffect`, not during render
- **RENDER** static placeholders before mount to prevent hydration mismatches

---

### 2. CSS Variables for Cross-Component Communication

**Problem**: Need to share sidebar collapsed state between Sidebar and DashboardLayout without using hooks (causes SSR issues).

**Solution**: Use CSS custom properties updated via JavaScript.

**Example**:
```typescript
// Sidebar.tsx - Update CSS variable
const toggleSidebar = () => {
  const newCollapsed = !isCollapsed
  setIsCollapsed(newCollapsed)

  // Update CSS variable for other components to read
  document.documentElement.style.setProperty(
    '--sidebar-width',
    newCollapsed ? '80px' : '256px'
  )
}

// DashboardLayout.tsx - Read CSS variable
export default function DashboardLayout({ children }) {
  return (
    <div>
      <Sidebar />
      <main style={{
        marginLeft: 'var(--sidebar-width, 256px)',
        transition: 'margin-left 0.3s ease-in-out'
      }}>
        {children}
      </main>
    </div>
  )
}
```

---

### 3. Turbopack Cache Corruption

**Problem**: Making file changes while dev server is running causes:
```
Failed to restore task data (corrupted database or bug)
Unable to open static sorted file
```

**Solution**: Always restart dev server after structural changes.

```bash
# Stop dev server (Ctrl+C)
# Clear cache
rm -rf .next
# Restart
npm run dev
```

---

### 4. Route Groups for Shared Layouts

**Problem**: Multiple pages (Dashboard, Tasks, Projects) need the same sidebar and protected route wrapper.

**Solution**: Use Next.js route groups like `(main)`.

**Structure**:
```
app/
├── (main)/           # Route group - shared layout
│   ├── layout.tsx    # Sidebar + ProtectedRoute
│   ├── dashboard/
│   │   └── page.tsx  # /dashboard
│   ├── tasks/
│   │   └── page.tsx  # /tasks
│   └── projects/
│       └── page.tsx  # /projects
├── login/
│   └── page.tsx      # /login (no sidebar)
└── layout.tsx        # Root layout
```

**Benefits**:
- Clean URL structure (no `(main)` in the path)
- Shared layout across all authenticated pages
- Separate auth pages without sidebar

---

### 5. SSR-Safe Component Pattern

**Universal pattern for any component that needs browser APIs**:

```typescript
"use client"

import { useState, useEffect } from "react"

export function SSRSafeComponent() {
  const [mounted, setMounted] = useState(false)
  const [value, setValue] = useState(defaultValue)

  useEffect(() => {
    setMounted(true)

    // Only access browser APIs here
    const stored = localStorage.getItem('key')
    if (stored) setValue(JSON.parse(stored))
  }, [])

  // Before mount: render static placeholder
  if (!mounted) {
    return <div className="w-10 h-10 bg-muted" />
  }

  // After mount: render full component with browser data
  return <div>{value}</div>
}
```

**Use this pattern for**:
- Components using `localStorage` / `sessionStorage`
- Components using `window` / `document`
- Components using browser APIs (`navigator`, `screen`, etc.)
- Any component that causes hydration mismatches
