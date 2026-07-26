/**
 * OPTIMIZED CHATBOT UI COMPONENT
 *
 * Copy this file to: components/Chatbot.tsx
 *
 * Features:
 * - Streaming message display
 * - Abort controller for request cancellation
 * - Proper cleanup and memory leak prevention
 * - Accessibility features (focus management, ARIA labels)
 * - Error handling with retry option
 * - Responsive design
 * - Dark mode support
 *
 * Works with all provider examples (OpenAI, Anthropic, Gemini, Groq, OpenRouter)
 *
 * Dependencies:
 *   npm install framer-motion react-markdown lucide-react
 *
 * Vercel Best Practices Applied:
 * - rerender-use-ref-transient-values: Refs for abort controller, reader
 * - rerender-functional-setstate: Functional updates for message accumulation
 * - rerender-move-effect-to-event: Streaming logic in handleSubmit, not useEffect
 * - rerender-lazy-state-init: Expensive callbacks created once
 * - rendering-conditional-render: Ternary operators, not &&
 * - js-early-exit: Early returns in validation
 * - bundle-dynamic-imports: ReactMarkdown loaded dynamically
 */

"use client";

import { useState, useRef, useEffect, useCallback, useTransition } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Send, AlertCircle, Bot, Minimize2, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";

// Dynamic import for ReactMarkdown (reduces initial bundle size)
const ReactMarkdown = dynamic(
  () => import("react-markdown").then((mod) => ({ default: mod.ReactMarkdown })),
  { ssr: false }
);

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp?: number;
}

interface ChatbotProps {
  apiUrl?: string;
  title?: string;
  placeholder?: string;
  className?: string;
  initialMessage?: string;
}

// Default welcome message (lazy initialization)
const DEFAULT_WELCOME = "**Hello!** 👋 I'm here to help. Ask me anything!";

export function Chatbot({
  apiUrl = "/api/chat",
  title = "AI Assistant",
  placeholder = "Type your message...",
  className = "",
  initialMessage = DEFAULT_WELCOME,
}: ChatbotProps) {
  // ============================================
  // STATE MANAGEMENT
  // ============================================

  // Refs for transient values (changes frequently, doesn't need re-render)
  const abortControllerRef = useRef<AbortController | null>(null);
  const readerRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Regular state (triggers re-renders)
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Non-urgent UI updates use transition
  const [isPending, startTransition] = useTransition();

  // ============================================
  // EFFECTS (Cleanup & Side Effects)
  // ============================================

  // Initialize with welcome message
  useEffect(() => {
    if (messages.length === 0) {
      setMessages([
        {
          id: "welcome",
          role: "assistant",
          content: initialMessage,
          timestamp: Date.now(),
        },
      ]);
    }
  }, [initialMessage]);

  // Auto-scroll to bottom when messages change
  useEffect(() => {
    if (scrollRef.current && isOpen && !isMinimized) {
      scrollRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages, isLoading, isOpen, isMinimized]);

  // Cleanup on unmount - prevent memory leaks
  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      readerRef.current?.cancel();
    };
  }, []);

  // Focus input when chat opens
  useEffect(() => {
    if (isOpen && !isMinimized) {
      // Small delay to ensure DOM is ready
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [isOpen, isMinimized]);

  // ============================================
  // STREAMING HANDLER (in event handler, not effect)
  // ============================================

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();

    // Early exit for empty input or loading state
    const trimmed = input.trim();
    if (trimmed.length === 0 || isLoading) return;

    // Cancel any existing request (abort previous stream)
    abortControllerRef.current?.abort();
    readerRef.current?.cancel();

    // Create new abort controller for this request
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Add user message immediately (optimistic update)
    const userMessage: Message = {
      id: `user-${Date.now()}`,
      role: "user",
      content: trimmed,
      timestamp: Date.now(),
    };

    // Functional setState for stable update
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);
    setError(null);

    // Create placeholder for assistant message
    const assistantId = `assistant-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: assistantId,
        role: "assistant",
        content: "",
        timestamp: Date.now(),
      },
    ]);

    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMessage],
        }),
        signal: controller.signal,
      });

      // Early exit for non-OK responses
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("No response body");

      readerRef.current = reader;
      const decoder = new TextDecoder();
      let buffer = "";

      // Read stream
      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;

          const data = line.slice(6).trim();
          if (!data) continue;

          try {
            const parsed = JSON.parse(data);

            if (parsed.content) {
              // Functional update to accumulate content
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === assistantId
                    ? { ...m, content: m.content + parsed.content }
                    : m
                )
              );
            }

            if (parsed.done) {
              setIsLoading(false);
            }

            if (parsed.error) {
              throw new Error(parsed.error);
            }
          } catch {
            // Ignore JSON parse errors for incomplete chunks
          }
        }
      }
    } catch (err) {
      // Handle abort (user cancelled)
      if (err instanceof Error && err.name === "AbortError") {
        return;
      }

      // Handle other errors
      const errorMessage = err instanceof Error ? err.message : "Something went wrong";
      setError(errorMessage);

      // Remove the empty assistant message on error
      setMessages((prev) => prev.filter((m) => m.id !== assistantId));
    } finally {
      setIsLoading(false);
      readerRef.current = null;
      inputRef.current?.focus();
    }
  }, [input, isLoading, messages, apiUrl]);

  // ============================================
  // EVENT HANDLERS (all in one place)
  // ============================================

  const handleRetry = useCallback(() => {
    setError(null);
    if (messages.length > 0) {
      const lastUserMessage = [...messages]
        .reverse()
        .find((m) => m.role === "user");
      if (lastUserMessage) {
        setInput(lastUserMessage.content);
      }
    }
  }, [messages]);

  const handleClear = useCallback(() => {
    abortControllerRef.current?.abort();
    setMessages([
      {
        id: "welcome",
        role: "assistant",
        content: initialMessage,
        timestamp: Date.now(),
      },
    ]);
    setError(null);
  }, [initialMessage]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit]
  );

  // ============================================
  // RENDER
  // ============================================

  return (
    <>
      {/* Floating Trigger Button */}
      <motion.div
        className={`fixed bottom-6 right-6 z-50 ${className}`}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
      >
        <motion.button
          onClick={() => {
            startTransition(() => {
              setIsOpen((prev) => !prev);
              setIsMinimized(false);
            });
          }}
          className="flex h-14 w-14 items-center justify-center rounded-full shadow-lg bg-primary hover:bg-primary/90 transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          aria-label={isOpen ? "Close chat" : "Open chat"}
          aria-expanded={isOpen}
        >
          <AnimatePresence mode="wait">
            {isOpen ? (
              <motion.div
                key="close"
                initial={{ rotate: -90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: 90, opacity: 0 }}
              >
                <X className="h-6 w-6 text-primary-foreground" />
              </motion.div>
            ) : (
              <motion.div
                key="open"
                initial={{ rotate: 90, opacity: 0 }}
                animate={{ rotate: 0, opacity: 1 }}
                exit={{ rotate: -90, opacity: 0 }}
              >
                <Bot className="h-6 w-6 text-primary-foreground" />
              </motion.div>
            )}
          </AnimatePresence>
        </motion.button>
      </motion.div>

      {/* Chat Window */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            className="fixed bottom-24 right-6 z-40 w-full max-w-md"
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
          >
            <div className="rounded-xl border bg-card shadow-xl overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-primary flex items-center justify-center">
                    <Bot className="h-4 w-4 text-primary-foreground" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-sm">{title}</h3>
                    <p className="text-xs text-muted-foreground">Powered by AI</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {messages.length > 1 ? (
                    <button
                      onClick={handleClear}
                      className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted transition-colors"
                      aria-label="Clear chat"
                      title="Clear chat history"
                    >
                      <AlertCircle className="h-4 w-4 text-muted-foreground" />
                    </button>
                  ) : null}
                  <button
                    onClick={() => startTransition(() => setIsMinimized((prev) => !prev))}
                    className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted transition-colors"
                    aria-label={isMinimized ? "Expand chat" : "Minimize chat"}
                  >
                    <Minimize2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => startTransition(() => setIsOpen(false))}
                    className="h-8 w-8 flex items-center justify-center rounded hover:bg-muted transition-colors"
                    aria-label="Close chat"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                </div>
              </div>

              {/* Messages Area */}
              {!isMinimized ? (
                <div className="h-[400px] overflow-y-auto p-4 space-y-4">
                  {messages.length === 0 ? (
                    <div className="flex h-full items-center justify-center text-center text-muted-foreground">
                      <p className="text-sm">Hello! How can I help you today?</p>
                    </div>
                  ) : (
                    messages.map((message) => (
                      <div
                        key={message.id}
                        className={`flex gap-3 ${
                          message.role === "user" ? "justify-end" : "justify-start"
                        }`}
                      >
                        {message.role === "assistant" ? (
                          <div className="h-8 w-8 flex-shrink-0 rounded-full bg-primary flex items-center justify-center">
                            <Bot className="h-4 w-4 text-primary-foreground" />
                          </div>
                        ) : null}
                        <div
                          className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                            message.role === "user"
                              ? "bg-primary text-primary-foreground"
                              : "bg-muted text-foreground"
                          }`}
                        >
                          {message.role === "user" ? (
                            <p className="whitespace-pre-wrap break-words text-sm">
                              {message.content}
                            </p>
                          ) : message.content.length > 0 ? (
                            <div className="prose prose-sm dark:prose-invert max-w-none">
                              <ReactMarkdown>{message.content}</ReactMarkdown>
                            </div>
                          ) : null}
                        </div>
                        {message.role === "user" ? (
                          <div className="h-8 w-8 flex-shrink-0 rounded-full bg-muted flex items-center justify-center">
                            <div className="h-4 w-4 rounded-full bg-foreground/20" />
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}

                  {/* Loading Indicator */}
                  {isLoading ? (
                    <div className="flex gap-3">
                      <div className="h-8 w-8 flex-shrink-0 rounded-full bg-primary flex items-center justify-center">
                        <Bot className="h-4 w-4 text-primary-foreground" />
                      </div>
                      <div className="flex items-center gap-1 rounded-2xl bg-muted px-4 py-2">
                        <div className="flex space-x-1">
                          <div className="h-2 w-2 animate-bounce rounded-full bg-foreground/50" />
                          <div className="h-2 w-2 animate-bounce rounded-full bg-foreground/50" style={{ animationDelay: "150ms" }} />
                          <div className="h-2 w-2 animate-bounce rounded-full bg-foreground/50" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Error Display */}
                  {error ? (
                    <div className="flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                      <AlertCircle className="h-4 w-4 flex-shrink-0" />
                      <p className="flex-1">{error}</p>
                      <button
                        onClick={handleRetry}
                        className="flex items-center gap-1 rounded bg-destructive/20 px-2 py-1 hover:bg-destructive/30 transition-colors"
                      >
                        <RefreshCw className="h-3 w-3" />
                        Retry
                      </button>
                    </div>
                  ) : null}

                  <div ref={scrollRef} />
                </div>
              ) : null}

              {/* Input Area */}
              {!isMinimized ? (
                <div className="border-t p-3">
                  <form onSubmit={handleSubmit} className="flex gap-2">
                    <input
                      ref={inputRef}
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder={placeholder}
                      disabled={isLoading}
                      className="flex-1 rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
                      aria-label="Message input"
                    />
                    <button
                      type="submit"
                      disabled={isLoading || !input.trim()}
                      className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
                      aria-label="Send message"
                    >
                      <Send className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              ) : null}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
