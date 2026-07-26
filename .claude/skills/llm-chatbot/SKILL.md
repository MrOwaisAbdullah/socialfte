---
name: llm-chatbot
description: Creates optimized LLM-powered chatbot implementations using Vercel AI SDK v6, Next.js 15, and Edge Runtime. Includes streaming API routes, performant UI components with proper state management, and error handling.
allowed-tools: Read, Write, Edit, Bash
---

# LLM Chatbot — AI SDK v6

Production-ready chatbot implementations using **Vercel AI SDK v6** (`ai` + `@ai-sdk/react`) with **Next.js 15** patterns. Each example includes:
- Streaming API route with Edge Runtime and `streamText`
- Optimized React component using `useChat` hook with `sendMessage` pattern
- Error handling, retry via `regenerate()`, and loading states
- Typing indicator (bouncing dots), auto-scroll, cleanup on unmount

## Key Dependencies

```bash
# Core AI SDK (required)
npm install ai @ai-sdk/react

# Provider SDK (pick one)
npm install @ai-sdk/openai       # OpenAI
npm install @ai-sdk/anthropic    # Anthropic
npm install @ai-sdk/google       # Gemini

# UI dependencies (from project implementation)
npm install framer-motion react-icons lucide-react next-themes react-markdown
```

## AI SDK v6 API — Key Changes

> [!IMPORTANT]
> AI SDK v6 significantly changed the `useChat` hook API. The old patterns (`input`, `handleInputChange`, `handleSubmit`, `isLoading`, `initialMessages`) are **removed**.

### What Changed

| Old (v5 / pre-v6)          | New (v6)                                          |
|----------------------------|---------------------------------------------------|
| `input` from `useChat`     | Local `useState('')` for input                    |
| `handleInputChange`        | `onChange={(e) => setInput(e.target.value)}`       |
| `handleSubmit`             | `sendMessage({ text: input })`                    |
| `isLoading`                | `status` (`'ready'` / `'submitted'` / `'streaming'` / `'error'`) |
| `initialMessages`          | `messages` (via `ChatInit`)                       |
| `message.content`          | `message.parts` (array of `{ type, text }`)       |
| `reload()`                 | `regenerate()`                                    |
| `maxTokens`                | `maxOutputTokens`                                 |
| `toDataStreamResponse()`   | `toUIMessageStreamResponse()`                     |
| `Message` type             | `UIMessage` type                                  |

### useChat Hook — v6 Returns

```typescript
const {
  messages,       // UIMessage[] — chat history
  sendMessage,    // ({ text: string }) => void — send a message
  regenerate,     // () => void — retry last assistant message
  stop,           // () => void — abort current stream
  status,         // 'ready' | 'submitted' | 'streaming' | 'error'
  error,          // Error | undefined
  setMessages,    // Update messages locally
  clearError,     // Clear error state
} = useChat({
  messages: initialMessages,       // UIMessage[] — initial messages
  experimental_throttle: 50,       // Throttle UI re-renders (ms)
});
```

## Production Examples

### 1. Floating Chatbot Widget (Portfolio Style)

Complete floating chatbot with animated button, theme toggle, and client-side greeting optimization:

```typescript
// components/Chatbot.tsx
"use client";

import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { FaTimes, FaPaperPlane } from "react-icons/fa";
import { BsRobot } from "react-icons/bs";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import ReactMarkdown from "react-markdown";
import Link from "next/link";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";

const INITIAL_MESSAGES: UIMessage[] = [
  {
    id: "welcome",
    role: "assistant",
    parts: [{ type: "text", text: "Hi! I'm your AI assistant. Ask me anything!" }],
  },
];

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [input, setInput] = useState("");
  const [isSimulating, setIsSimulating] = useState(false);

  const { theme, setTheme } = useTheme();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const {
    messages,
    sendMessage,
    error,
    regenerate,
    stop,
    status,
    setMessages,
  } = useChat({
    messages: INITIAL_MESSAGES,
    experimental_throttle: 50,
  });

  const isLoading = status === "submitted" || status === "streaming" || isSimulating;

  // Auto-scroll to bottom
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (container) {
      container.scrollTop = container.scrollHeight;
    }
  }, [messages]);

  useEffect(() => setMounted(true), []);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stop();
    };
  }, [stop]);

  // Client-side greeting handling (saves LLM costs)
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;

    const lowerInput = trimmed.toLowerCase().replace(/[^a-z0-9\s]/g, "");
    const greetingMatches = [
      "hi", "hello", "hey", "salam", "assalamualikum", "assalamoalikum", 
      "assalamu alaikum", "assalamo alaikum", "greetings", "assalmualikum", 
      "asalamualikum", "asalam", "assalam", "hi there", "hello there"
    ];

    const isGreeting = greetingMatches.some(g => 
      lowerInput === g || lowerInput.startsWith(g + " ")
    );

    if (isGreeting) {
      const fakeUserMessage: UIMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        parts: [{ type: "text", text: trimmed }]
      };

      let botReply = "Hi there! 👋 How can I help you today?";
      if (lowerInput.includes("salam") || lowerInput.includes("assalam")) {
        botReply = "Walaikum Assalam! 👋 How can I help you today?";
      }

      const botMessageId = `bot-${Date.now()}`;
      const emptyBotMessage: UIMessage = {
        id: botMessageId,
        role: "assistant",
        parts: [{ type: "text", text: "" }]
      };

      setMessages([...messages, fakeUserMessage, emptyBotMessage]);
      setIsSimulating(true);

      const thinkingDelay = Math.floor(Math.random() * 500) + 500;

      setTimeout(() => {
        let currentText = "";
        const chars = botReply.split("");
        let charIndex = 0;

        const streamInterval = setInterval(() => {
          if (charIndex < chars.length) {
            currentText += chars[charIndex];
            setMessages((prev) => 
              prev.map(msg => 
                msg.id === botMessageId 
                  ? { ...msg, parts: [{ type: "text", text: currentText }] }
                  : msg
              )
            );
            charIndex++;
          } else {
            clearInterval(streamInterval);
            setIsSimulating(false);
          }
        }, 15);
      }, thinkingDelay);

      setInput("");
      return;
    }

    // Normal LLM flow
    sendMessage({ text: trimmed });
    setInput("");
  };

  const getMessageText = (message: typeof messages[0]) => {
    return message.parts
      ?.filter((part) => part.type === "text")
      .map((part) => (part as { type: "text"; text: string }).text)
      .join("") || "";
  };

  return (
    <>
      {/* Floating Button */}
      <div className="fixed bottom-6 right-6 z-50">
        {!isOpen && (
          <motion.div
            className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 opacity-40 blur-xl"
            animate={{
              scale: [1, 1.5, 1],
              opacity: [0.3, 0.15, 0.3],
            }}
            transition={{
              duration: 2.5,
              repeat: Infinity,
              ease: "easeInOut",
            }}
          />
        )}
        <motion.button
          initial={{ scale: 0, opacity: 0 }}
          animate={{
            scale: 1,
            opacity: 1,
            y: isOpen ? 0 : [0, -6, 0],
          }}
          transition={isOpen ? { type: "spring", stiffness: 260, damping: 20 } : {
            y: { duration: 3, repeat: Infinity, ease: "easeInOut" },
            scale: { type: "spring", stiffness: 260, damping: 20, duration: 0.4 },
            opacity: { duration: 0.4 },
          }}
          whileHover={{
            scale: 1.12,
          }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsOpen(!isOpen)}
          className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ${
            isOpen
              ? "bg-gradient-to-r from-yellow-400 to-orange-500 hover:opacity-90 shadow-[0_4px_24px_rgba(254,205,26,0.3)] ring-1 ring-black/10"
              : "bg-gradient-to-r from-yellow-400 to-orange-500 shadow-[0_4px_24px_rgba(254,205,26,0.4)] hover:shadow-[0_4px_32px_rgba(254,205,26,0.6)] border border-white/20"
          }`}
          aria-label={isOpen ? "Close chat" : "Open chat"}
        >
          <AnimatePresence mode="wait" initial={false}>
            {isOpen ? (
              <motion.div
                key="close"
                initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
                animate={{ rotate: 0, opacity: 1, scale: 1 }}
                exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
                transition={{ duration: 0.2 }}
                className="absolute inset-0 flex items-center justify-center text-black"
              >
                <FaTimes size={24} />
              </motion.div>
            ) : (
              <motion.div
                key="bot"
                initial={{ rotate: 90, opacity: 0, scale: 0.5 }}
                animate={{
                  rotate: [0, -12, 12, -8, 8, 0],
                  opacity: 1,
                  scale: 1,
                }}
                exit={{ 
                  rotate: -90, 
                  opacity: 0, 
                  scale: 0.5,
                  transition: { duration: 0.2 } 
                }}
                transition={{
                  rotate: { duration: 1.5, repeat: Infinity, ease: "easeInOut", repeatDelay: 1 },
                  opacity: { duration: 0.2 },
                  scale: { duration: 0.2 },
                }}
                className="absolute inset-0 flex items-center justify-center text-black"
              >
                <BsRobot size={26} />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </div>

      {/* Chat Panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.9, transformOrigin: 'bottom right' }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.9 }}
            transition={{ type: "spring", bounce: 0, duration: 0.4 }}
            className="fixed bottom-24 right-4 sm:right-6 w-[calc(100%-2rem)] sm:w-[400px] h-[75vh] max-h-[600px] z-50 flex flex-col"
          >
            <div className="bg-transparent overflow-hidden flex flex-col h-full rounded-2xl shadow-[0_8px_40px_rgba(0,0,0,0.3)] ring-1 ring-border/50">
              {/* Header */}
              <div className="bg-card/95 backdrop-blur-xl border-b border-border/50 p-4 relative overflow-hidden shrink-0 rounded-t-2xl">
                <div className="absolute inset-0 bg-gradient-to-r from-yellow-400/3 to-orange-500/3 pointer-events-none" />
                <div className="flex items-center justify-between relative z-10">
                  <div className="flex items-center gap-3">
                    <div className="relative group">
                      <div className="w-10 h-10 bg-gradient-to-r from-yellow-400 to-orange-500 rounded-full flex items-center justify-center shadow-[0_0_15px_rgba(254,205,26,0.3)] group-hover:shadow-[0_0_20px_rgba(254,205,26,0.5)] transition-all">
                        <BsRobot className="text-black text-lg" />
                      </div>
                      <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-green-500 rounded-full border-2 border-card animate-pulse" />
                    </div>
                    <div>
                      <h3 className="font-montserrat font-bold text-foreground tracking-wide">
                        AI Assistant
                      </h3>
                      <p className="text-xs text-muted-foreground font-medium">
                        {status === "streaming" || (isSimulating && messages.length > 0 && getMessageText(messages[messages.length - 1]).length > 0) ? (
                          "Typing..."
                        ) : status === "submitted" || isSimulating ? (
                          "Thinking..."
                        ) : (
                          "Ask about my services"
                        )}
                      </p>
                    </div>
                  </div>
                  {/* Theme Toggle */}
                  {mounted ? (
                    <motion.button
                      whileHover={{ scale: 1.1 }}
                      whileTap={{ scale: 0.9 }}
                      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                      className="w-8 h-8 rounded-full flex items-center justify-center bg-white/10 dark:bg-white/5 border border-border/50 hover:bg-white/20 dark:hover:bg-white/10 transition-colors"
                      aria-label="Toggle theme"
                    >
                      <AnimatePresence mode="wait" initial={false}>
                        {theme === "dark" ? (
                          <motion.div
                            key="sun"
                            initial={{ rotate: -90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: 90, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            <Sun className="h-4 w-4 text-yellow-400" />
                          </motion.div>
                        ) : (
                          <motion.div
                            key="moon"
                            initial={{ rotate: 90, opacity: 0 }}
                            animate={{ rotate: 0, opacity: 1 }}
                            exit={{ rotate: -90, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                          >
                            <Moon className="h-4 w-4 text-muted-foreground" />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  ) : null}
                </div>
              </div>

              {/* Messages */}
              <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-5 min-h-0 [scrollbar-width:thin] bg-card/95 backdrop-blur-md">
                <AnimatePresence initial={false}>
                  {messages.map((message) => {
                    const text = getMessageText(message);
                    const isAssistant = message.role === "assistant";

                    if (!text && isAssistant && !isLoading) return null;
                    if (!text && isAssistant && message.id === "welcome") return null;

                    const showDots = !text && isAssistant && isLoading;

                    return (
                      <div
                        key={message.id}
                        className={`flex ${
                          message.role === "user" ? "justify-end" : "justify-start"
                        }`}
                      >
                        <div
                          className={`max-w-[85%] px-5 py-3 shadow-sm ${
                            message.role === "user"
                              ? "bg-gradient-to-r from-yellow-400 to-orange-500 text-black rounded-t-2xl rounded-l-2xl rounded-br-sm"
                              : "bg-card text-foreground rounded-t-2xl rounded-r-2xl rounded-bl-sm shadow-md"
                          }`}
                        >
                          {showDots ? (
                            <div className="flex gap-2 items-center h-4 py-1" style={{ animation: 'chatFadeIn 0.2s ease-out' }}>
                              <span className="w-2.5 h-2.5 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
                              <span className="w-2.5 h-2.5 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
                              <span className="w-2.5 h-2.5 bg-accent rounded-full animate-bounce" />
                            </div>
                          ) : isAssistant ? (
                            <div className="text-sm leading-relaxed font-medium prose-chat" style={{ animation: 'chatFadeIn 0.3s ease-out' }}>
                              <ReactMarkdown
                                components={{
                                  a: ({ href, children }) => (
                                    <Link
                                      href={href || "#"}
                                      className="text-accent hover:underline font-semibold transition-colors"
                                    >
                                      {children}
                                    </Link>
                                  ),
                                  p: ({ children }) => (
                                    <p className="mb-1.5 last:mb-0">{children}</p>
                                  ),
                                  strong: ({ children }) => (
                                    <strong className="font-bold text-foreground">{children}</strong>
                                  ),
                                  ul: ({ children }) => (
                                    <ul className="list-disc list-inside mb-1.5 space-y-0.5">{children}</ul>
                                  ),
                                  ol: ({ children }) => (
                                    <ol className="list-decimal list-inside mb-1.5 space-y-0.5">{children}</ol>
                                  ),
                                  li: ({ children }) => (
                                    <li className="text-sm">{children}</li>
                                  ),
                                }}
                              >
                                {text}
                              </ReactMarkdown>
                            </div>
                          ) : (
                            <p className="text-sm leading-relaxed whitespace-pre-wrap font-medium">
                              {text}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {/* Typing indicator for submitted phase */}
                  {status === "submitted" && messages[messages.length - 1]?.role === "user" ? (
                    <div className="flex justify-start">
                      <div className="bg-card text-foreground rounded-t-2xl rounded-r-2xl rounded-bl-sm px-5 py-4 shadow-md">
                        <div className="flex gap-2 items-center h-4">
                          <span className="w-2.5 h-2.5 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
                          <span className="w-2.5 h-2.5 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
                          <span className="w-2.5 h-2.5 bg-accent rounded-full animate-bounce" />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Error display with retry */}
                  {error ? (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="flex justify-start"
                    >
                      <div className="max-w-[85%] bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-300 rounded-2xl px-5 py-3 shadow-md">
                        <p className="text-sm font-medium mb-2">
                          Something went wrong. Please try again.
                        </p>
                        <button
                          onClick={() => regenerate()}
                          className="text-xs bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-200 px-3 py-1.5 rounded-full transition-colors font-medium"
                        >
                          ↻ Retry
                        </button>
                      </div>
                    </motion.div>
                  ) : null}
                </AnimatePresence>
                <div ref={messagesEndRef} className="h-2" />
              </div>

              {/* Input */}
              <form onSubmit={handleSubmit} className="p-3 sm:p-4 bg-card shrink-0 rounded-b-2xl border-t border-border/50">
                <div className="flex gap-2 items-center">
                  <input
                    ref={inputRef}
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask about my skills or services..."
                    disabled={status !== "ready" && status !== "error"}
                    className="flex-1 bg-secondary/50 focus:bg-secondary border border-border/50 focus:border-primary/50 rounded-full px-5 py-3 text-sm font-medium text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                  />
                  <motion.button
                    type="submit"
                    disabled={isLoading || !input.trim()}
                    whileHover={{ scale: (isLoading || !input.trim()) ? 1 : 1.05 }}
                    whileTap={{ scale: (isLoading || !input.trim()) ? 1 : 0.95 }}
                    className="bg-gradient-to-r from-yellow-400 to-orange-500 text-black flex items-center justify-center w-[46px] h-[46px] shrink-0 rounded-full shadow-[0_0_15px_rgba(254,205,26,0.3)] disabled:opacity-50 disabled:cursor-not-allowed transition-opacity border border-black/10"
                    aria-label="Send message"
                  >
                    <FaPaperPlane className="text-sm relative right-[1px]" />
                  </motion.button>
                </div>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
```

### 2. Dynamic Import Wrapper

```typescript
// components/ChatbotWrapper.tsx
"use client";

import dynamic from "next/dynamic";

// Dynamically import Chatbot with SSR disabled and no loading state
const Chatbot = dynamic(() => import("./Chatbot").then(mod => ({ default: mod.default })), {
  ssr: false,
  loading: () => null,
});

export default function ChatbotWrapper() {
  return <Chatbot />;
}
```

### 3. Edge Runtime API Route

```typescript
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai';
import { streamText, UIMessage, convertToModelMessages } from 'ai';

// Edge Runtime for global low-latency deployment
export const runtime = 'edge';
export const maxDuration = 30;

const SYSTEM_PROMPT = `You are a helpful AI assistant on a portfolio website. You can answer any question on any topic. When relevant, you are especially knowledgeable about:

- Portfolio owner's background, skills, experience, and expertise
- Services offered: AI Automations, Chatbot Development, Web Development
- Projects and portfolio work
- Contacting or hiring the portfolio owner

If the user simply greets you (e.g., "Hi", "Hello"), ONLY reply with a polite greeting back. Do not add extra information unless asked.

Respond concisely (1–3 sentences). Maintain a friendly, professional tone. When mentioning pages or services, always use markdown links like [Service Name](/services/slug).

Website pages:
- Home: /
- About: /about
- Skills: /skills
- Services: /services
- Contact: /contact

Service pages:
- AI Automations & Workflows: /services/ai-automations
- AI Chatbot Development: /services/chatbot-development
- Full-Stack Web Development: /services/web-development`;

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const result = streamText({
      model: openai('gpt-4o-mini'),
      messages: await convertToModelMessages(messages),
      system: SYSTEM_PROMPT,
      temperature: 0.7,
      maxOutputTokens: 500,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'An error occurred',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### 4. Client-Side Greeting Optimization

Smart greeting detection to reduce LLM API costs for common greetings:

```typescript
// Greeting patterns (comprehensive for misspellings)
const greetingMatches = [
  "hi", "hello", "hey", "salam", "assalamualikum", "assalamoalikum", 
  "assalamu alaikum", "assalamo alaikum", "greetings", "assalmualikum", 
  "asalamualikum", "asalam", "assalam", "hi there", "hello there"
];

// Check if input is strictly a greeting or starts with greeting
const isGreeting = greetingMatches.some(g => 
  lowerInput === g || lowerInput.startsWith(g + " ")
);

// Simulate streaming response for greetings
if (isGreeting) {
  // Add fake messages and simulate typing
  const thinkingDelay = Math.floor(Math.random() * 500) + 500;
  setTimeout(() => {
    // Artificial streaming effect (15ms per character)
    const streamInterval = setInterval(() => {
      // Update message text character by character
    }, 15);
  }, thinkingDelay);
}
```

### 5. Markdown Message Rendering

Advanced markdown rendering with custom link handling:

```typescript
<ReactMarkdown
  components={{
    a: ({ href, children }) => (
      <Link
        href={href || "#"}
        className="text-accent hover:underline font-semibold transition-colors"
      >
        {children}
      </Link>
    ),
    p: ({ children }) => (
      <p className="mb-1.5 last:mb-0">{children}</p>
    ),
    strong: ({ children }) => (
      <strong className="font-bold text-foreground">{children}</strong>
    ),
    ul: ({ children }) => (
      <ul className="list-disc list-inside mb-1.5 space-y-0.5">{children}</ul>
    ),
    ol: ({ children }) => (
      <ol className="list-decimal list-inside mb-1.5 space-y-0.5">{children}</ol>
    ),
    li: ({ children }) => (
      <li className="text-sm">{children}</li>
    ),
  }}
>
  {text}
</ReactMarkdown>
```

### 6. Animated Floating Button

Premium floating button with pulsing glow and morphing animations:

```typescript
// Pulsing glow ring
{!isOpen && (
  <motion.div
    className="absolute inset-0 rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 opacity-40 blur-xl"
    animate={{
      scale: [1, 1.5, 1],
      opacity: [0.3, 0.15, 0.3],
    }}
    transition={{
      duration: 2.5,
      repeat: Infinity,
      ease: "easeInOut",
    }}
  />
)}

// Button with continuous floating animation
<motion.button
  animate={{
    scale: 1,
    opacity: 1,
    y: isOpen ? 0 : [0, -6, 0], // Floating effect when closed
  }}
  transition={isOpen ? { type: "spring", stiffness: 260, damping: 20 } : {
    y: { duration: 3, repeat: Infinity, ease: "easeInOut" },
    scale: { type: "spring", stiffness: 260, damping: 20, duration: 0.4 },
    opacity: { duration: 0.4 },
  }}
  // ... rest of button props
>
  <AnimatePresence mode="wait" initial={false}>
    {/* Icon morphing between robot and close */}
  </AnimatePresence>
</motion.button>
```

## Quick Start

### 1. API Route (Edge Runtime)

```typescript
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai';
import { streamText, UIMessage, convertToModelMessages } from 'ai';

export const runtime = 'edge';
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const result = streamText({
      model: openai('gpt-4o-mini'),
      messages: await convertToModelMessages(messages),
      system: 'You are a helpful assistant.',
      temperature: 0.7,
      maxOutputTokens: 500,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'An error occurred',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### 2. Basic Chat Component

```typescript
// components/Chatbot.tsx
"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";

export default function Chatbot() {
  const [input, setInput] = useState("");

  const { messages, sendMessage, status } = useChat({
    experimental_throttle: 50,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    sendMessage({ text: input });
    setInput("");
  };

  return (
    <div className="w-full max-w-md mx-auto">
      <div className="space-y-4 mb-4 h-96 overflow-y-auto">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`p-3 rounded-lg ${
              message.role === "user"
                ? "bg-blue-500 text-white ml-12"
                : "bg-gray-200 text-black mr-12"
            }`}
          >
            {message.parts
              ?.filter((part) => part.type === "text")
              .map((part) => (part as { type: "text"; text: string }).text)
              .join("")}
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          disabled={status !== "ready"}
          className="flex-1 p-2 border rounded"
        />
        <button
          type="submit"
          disabled={status !== "ready" || !input.trim()}
          className="px-4 py-2 bg-blue-500 text-white rounded disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  );
}
```

## Advanced Features

### Error Handling & Retry

```typescript
const { error, regenerate, clearError } = useChat({ ... });

// Display error with retry button
{error && (
  <div className="bg-red-100 text-red-700 p-3 rounded">
    <p>Something went wrong. Please try again.</p>
    <button
      onClick={() => regenerate()}
      className="mt-2 px-3 py-1 bg-red-200 rounded"
    >
      Retry
    </button>
  </div>
)}
```

### Message Status Indicators

```typescript
// Different status values
const status = 'ready' | 'submitted' | 'streaming' | 'error';

// Show appropriate UI based on status
{status === 'streaming' && <TypingIndicator />}
{status === 'submitted' && <div>Thinking...</div>}
{status === 'error' && <ErrorMessage />}
```

### Auto-scroll & Cleanup

```typescript
useEffect(() => {
  // Auto-scroll to bottom on new messages
  const container = scrollContainerRef.current;
  if (container) {
    container.scrollTop = container.scrollHeight;
  }
}, [messages]);

useEffect(() => {
  // Cleanup streaming on unmount
  return () => {
    stop();
  };
}, [stop]);
```

## Best Practices

1. **Edge Runtime**: Use `export const runtime = 'edge'` for global low-latency
2. **Throttle Updates**: Set `experimental_throttle: 50` to reduce excessive re-renders
3. **Error Boundaries**: Wrap chat components in error boundaries
4. **Memory Management**: Clean up streams on component unmount
5. **Client-side Optimization**: Handle simple greetings client-side to reduce API costs
6. **Accessibility**: Add proper ARIA labels and keyboard navigation
7. **Performance**: Use dynamic imports to prevent SSR issues
8. **Type Safety**: Use `UIMessage` type for all message objects

```typescript
const {
  messages,       // UIMessage[] — chat history
  sendMessage,    // ({ text: string }) => void — send a message
  regenerate,     // () => void — retry last assistant message
  stop,           // () => void — abort current stream
  status,         // 'ready' | 'submitted' | 'streaming' | 'error'
  error,          // Error | undefined
  setMessages,    // Update messages locally
  clearError,     // Clear error state
} = useChat({
  messages: initialMessages,       // UIMessage[] — initial messages
  experimental_throttle: 50,       // Throttle UI re-renders (ms)
});
```

## Quick Start

### 1. API Route (Edge Runtime)

```typescript
// app/api/chat/route.ts
import { openai } from '@ai-sdk/openai';
import { streamText, UIMessage, convertToModelMessages } from 'ai';

export const runtime = 'edge';
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await req.json();

    const result = streamText({
      model: openai('gpt-4o-mini'),
      messages: await convertToModelMessages(messages),
      system: 'You are a helpful assistant.',
      temperature: 0.7,
      maxOutputTokens: 500,
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'An error occurred',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}
```

### 2. Chatbot Component

```tsx
'use client';

import { useState, useRef, useEffect } from 'react';
import { useChat } from '@ai-sdk/react';
import type { UIMessage } from 'ai';

const INITIAL_MESSAGES: UIMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    parts: [{ type: 'text', text: 'Hi! How can I help you?' }],
  },
];

export default function Chatbot() {
  // Local input state (AI SDK v6 — useChat no longer manages input)
  const [input, setInput] = useState('');

  const { messages, sendMessage, error, regenerate, stop, status } = useChat({
    messages: INITIAL_MESSAGES,
    experimental_throttle: 50,
  });

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const isLoading = status === 'submitted' || status === 'streaming';

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup on unmount
  useEffect(() => {
    return () => { stop(); };
  }, [stop]);

  // Submit handler
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    sendMessage({ text: trimmed });
    setInput('');
  };

  // Extract text from message parts
  const getMessageText = (message: typeof messages[0]) => {
    return message.parts
      ?.filter((p) => p.type === 'text')
      .map((p) => (p as { type: 'text'; text: string }).text)
      .join('') || '';
  };

  return (
    <div>
      {/* Messages */}
      {messages.map((msg) => {
        const text = getMessageText(msg);
        if (!text && msg.role === 'assistant') return null;
        return (
          <div key={msg.id}>
            <strong>{msg.role === 'user' ? 'You' : 'AI'}:</strong> {text}
          </div>
        );
      })}

      {/* Typing indicator */}
      {isLoading ? <div>Thinking...</div> : null}

      {/* Error with retry */}
      {error ? (
        <div>
          <p>Error occurred.</p>
          <button onClick={() => regenerate()}>Retry</button>
        </div>
      ) : null}

      <div ref={messagesEndRef} />

      {/* Input */}
      <form onSubmit={handleSubmit}>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={status !== 'ready' && status !== 'error'}
          placeholder="Type a message..."
        />
        <button type="submit" disabled={isLoading || !input.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}
```

### 3. Use in Your App

```tsx
import Chatbot from '@/components/Chatbot';

export default function Page() {
  return <Chatbot />;
}
```

## UI Patterns & Improvements

### Floating Trigger Animation Fix

When using `framer-motion` for the toggle button (switching between a chat icon and a close icon), use `AnimatePresence mode="wait"`. **Crucially**, define an `exit` duration on the icons so the exit animation finishes *before* the new icon renders.

```tsx
<AnimatePresence mode="wait" initial={false}>
  {isOpen ? (
    <motion.div
      key="close"
      initial={{ rotate: -90, opacity: 0, scale: 0.5 }}
      animate={{ rotate: 0, opacity: 1, scale: 1 }}
      exit={{ rotate: 90, opacity: 0, scale: 0.5 }}
      transition={{ duration: 0.2 }} // Crucial for smooth icon swap
    >
      <FaTimes />
    </motion.div>
  ) : (
    <motion.div
      key="bot"
      // Entrance, exit, and idle bounce animations here...
      exit={{ opacity: 0, scale: 0.5, transition: { duration: 0.2 } }} // Must have duration
    >
      <BsRobot />
    </motion.div>
  )}
</AnimatePresence>
```

### Chat Panel Background Clarity (Dark/Light Modes)

High opacity + blur prevents page content from bleeding through and making text unreadable, especially in light mode.

```tsx
// Container mapping to the Chat Window
<div className="bg-card/95 backdrop-blur-xl border border-border/50 shadow-2xl rounded-2xl">
  {/* Content */}
</div>
```

### Input Field Design (The "Pill")

A modern, rounded pill design performs better for chat interfaces than traditional square inputs.

```tsx
<input
  type="text"
  placeholder="Ask about my skills or services..."
  className="w-full bg-secondary/50 focus:bg-secondary border border-border/50 focus:border-primary/50 rounded-full px-5 py-3 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-primary/20 transition-all"
/>
```

### Performance-Optimized Message Streaming

When text streams from the LLM, the layout continuously shifts. Using standard `framer-motion` (especially with the `layout` prop) on every message bubble will cause severe performance degradation and "bouncing" text. 

**Best Practice:** Use pure CSS animations for entering messages instead of `motion.div`.

```css
/* In globals.css */
@keyframes chatFadeIn {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
```

```tsx
// Inside messages.map() in Chatbot.tsx
// ✅ Use standard divs with CSS animations instead of motion.div
<div 
  key={message.id} 
  className="flex justify-start"
>
  <div 
    className="bg-card px-5 py-3 shadow-md rounded-2xl"
    style={{ animation: 'chatFadeIn 0.3s ease-out' }}
  >
    {text}
  </div>
</div>
```

### Typing Indicator (Bouncing Dots)

Show a high-quality bouncing dots animation in two distinct phases. Phase 1: Request is submitted but no internal message context exists yet. Phase 2: The assistant message exists in the UI but hasn't streamed text yet.

```tsx
// Phase 1: Standalone UI element at the bottom of the chat list
{status === "submitted" && messages[messages.length - 1]?.role === "user" ? (
  <div className="flex justify-start">
    <div className="bg-card rounded-2xl px-5 py-4 shadow-md">
      <div className="flex gap-2 items-center h-4">
        <span className="w-2.5 h-2.5 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
        <span className="w-2.5 h-2.5 bg-accent rounded-full animate-bounce [animation-delay:-0.15s]" />
        <span className="w-2.5 h-2.5 bg-accent rounded-full animate-bounce" />
      </div>
    </div>
  </div>
) : null}

// Phase 2: Rendered inside the assistant's message bubble while 'showDots' is true
// const showDots = !text && isAssistant && isLoading;
{showDots ? (
  <div className="flex gap-2 items-center h-4 py-1" style={{ animation: 'chatFadeIn 0.2s ease-out' }}>
    <span className="w-2.5 h-2.5 bg-accent rounded-full animate-bounce [animation-delay:-0.3s]" />
    {/* ... remaining dots ... */}
  </div>
) : (
  <p>{text}</p>
)}
```

### Streaming Markdown Integration

Use `react-markdown` to safely render the Markdown streams emitted by the LLM. Apply custom styling via the `components` prop to ensure links and lists look good inside the chat bubble.

```tsx
import ReactMarkdown from "react-markdown";

<ReactMarkdown
  components={{
    a: ({ href, children }) => (
      <a href={href || "#"} className="text-accent hover:underline font-semibold" target="_blank">
        {children}
      </a>
    ),
    p: ({ children }) => <p className="mb-1.5 last:mb-0">{children}</p>,
    strong: ({ children }) => <strong className="font-bold">{children}</strong>,
    ul: ({ children }) => <ul className="list-disc list-inside mb-1.5">{children}</ul>,
  }}
>
  {text}
</ReactMarkdown>
```

### Error Bubble Styling

Handle errors gracefully with an integrated bubble matching the chat layout, styled cleanly for both Light/Dark modes using Tailwind:

```tsx
{error && (
  <div className="flex justify-start">
    <div className="max-w-[85%] bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-300 rounded-2xl px-5 py-3 shadow-md">
      <p className="text-sm font-medium mb-2">Something went wrong.</p>
      <button
        onClick={() => regenerate()}
        className="text-xs bg-red-100 hover:bg-red-200 dark:bg-red-900/40 dark:hover:bg-red-900/60 text-red-700 dark:text-red-200 px-3 py-1.5 rounded-full transition-colors font-medium"
      >
        ↻ Retry
      </button>
    </div>
  </div>
)}
```

### Client-Side Greeting Interception

For simple greetings ("Hi", "Assalamualikum"), skip the LLM entirely. Instead:
1. Append the user message + an **empty** bot message to `messages` via `setMessages`.
2. Set `isSimulating = true` to activate typing dots (since `isLoading` won't be `true`).
3. After a random 500–1000ms thinking delay, stream the reply character by character with `setInterval`.

```tsx
// In component state
const [isSimulating, setIsSimulating] = useState(false);
const isLoading = status === 'submitted' || status === 'streaming' || isSimulating;

// Greeting variants — expand this list to handle misspellings
const greetingMatches = [
  'hi', 'hello', 'hey', 'salam', 'assalamualikum', 'assalamu alaikum',
  'greetings', 'assalmualikum', 'asalamualikum', 'asalam', 'assalam',
];

// Check for exact match OR starts-with (e.g., "hi there")
const isGreeting = greetingMatches.some(g =>
  lowerInput === g || lowerInput.startsWith(g + ' ')
);

if (isGreeting) {
  setInput('');
  const botMessageId = `bot-${Date.now()}`;
  setMessages([...messages,
    { id: `user-${Date.now()}`, role: 'user', parts: [{ type: 'text', text: trimmed }] },
    { id: botMessageId,       role: 'assistant', parts: [{ type: 'text', text: '' }] },
  ]);
  setIsSimulating(true);

  const reply = lowerInput.includes('salam') ? 'Walaikum Assalam! 👋' : 'Hi there! 👋';
  const delay = Math.floor(Math.random() * 500) + 500; // 500–1000ms

  setTimeout(() => {
    let i = 0, built = '';
    const interval = setInterval(() => {
      if (i < reply.length) {
        built += reply[i++];
        setMessages(prev => prev.map(m =>
          m.id === botMessageId ? { ...m, parts: [{ type: 'text', text: built }] } : m
        ));
      } else {
        clearInterval(interval);
        setIsSimulating(false);
      }
    }, 15);
  }, delay);
  return;
}
```

### Keeping the Chat Open on Link Clicks

**Do NOT add `onClick={() => setIsOpen(false)}` to links inside messages.** This was a common mistake — links inside the chat message markdown should navigate the page (via `next/link`) without closing the chat panel.

```tsx
// ✅ Good — chat stays open when link is clicked
a: ({ href, children }) => (
  <Link href={href || '#'} className="text-accent hover:underline font-semibold">
    {children}
  </Link>
),

// ❌ Bad — clicking a link slams the chat closed
a: ({ href, children }) => (
  <Link href={href || '#'} onClick={() => setIsOpen(false)}>
    {children}
  </Link>
),
```

### Reliable Scroll-to-Bottom

Using `scrollIntoView` on a `messagesEndRef` inside a custom scrollable container can be unreliable. Instead, attach a `ref` directly to the scrollable div and set `scrollTop = scrollHeight`.

```tsx
const scrollContainerRef = useRef<HTMLDivElement>(null);

// Trigger after every messages update
useEffect(() => {
  const el = scrollContainerRef.current;
  if (el) el.scrollTop = el.scrollHeight; // instant, always accurate
}, [messages]);

// Attach to the scrollable messages container
<div ref={scrollContainerRef} className="flex-1 overflow-y-auto ...">
  {/* messages */}
</div>
```

## Performance Checklist

- [x] Edge Runtime for API routes (`export const runtime = 'edge'`)
- [x] `experimental_throttle: 50` to batch UI re-renders during streaming
- [x] Local `useState` for input (not from useChat)
- [x] `stop()` cleanup in `useEffect` return
- [x] Scroll-to-bottom via `scrollContainerRef` + `scrollTop = scrollHeight`
- [x] Focus management on chat open
- [x] No `layout` prop on streaming message elements
- [x] Ternary operators for conditional rendering (not `&&`)
- [x] Client-side greeting intercept skips LLM for simple greetings
- [x] `isSimulating` state to unify loading state for real + fake messages


## Error Handling

1. **`error` from useChat** — Display error banner with retry button
2. **`regenerate()`** — Retry the last assistant response
3. **`stop()`** — Abort current streaming request
4. **`clearError()`** — Reset error state to `'ready'`
5. **API try/catch** — Return JSON error responses from the API route

## Accessibility Checklist

- [x] `aria-label` for icon buttons (open/close/send)
- [x] Focus input when chat opens
- [x] Keyboard submit via Enter key
- [x] Disabled state styling for input/buttons during loading
- [x] Error messages with actionable retry

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `input` not in useChat | AI SDK v6 change | Use local `useState` for input |
| `handleSubmit` missing | AI SDK v6 change | Use `sendMessage({ text })` |
| `reload` missing | AI SDK v6 rename | Use `regenerate()` |
| `maxTokens` error | AI SDK v6 rename | Use `maxOutputTokens` |
| `toDataStreamResponse` error | AI SDK v6 change | Use `toUIMessageStreamResponse()` |
| Bubble bouncing on stream | Framer Motion `layout` | Remove `layout` prop from messages |
| Empty bubble, no dots | Dots too small/faint | Use `w-2.5 h-2.5 bg-accent` |
| Send button disabled | `input` from old API | Use local `useState` for input |
| Type comparison error | Narrow initial messages type | Type as `UIMessage[]` explicitly |
| Greeting triggers LLM | Exact match too strict | Use `.some()` with `startsWith` check |
| Chat closes on link click | `onClick` on link removes panel | Remove `onClick` from markdown links |
| Scroll doesn't reach bottom | `scrollIntoView` unreliable in overflow div | Use `scrollContainerRef` + `scrollTop = scrollHeight` |

## References

- [AI SDK v6 Docs](https://ai-sdk.dev/docs/ai-sdk-ui/chatbot)
- [useChat Reference](https://ai-sdk.dev/docs/reference/ai-sdk-ui/use-chat)
- Vercel React Best Practices — See `../vercel-react-best-practices/SKILL.md`
