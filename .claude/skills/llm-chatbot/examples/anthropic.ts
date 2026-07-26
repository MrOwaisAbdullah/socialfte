/**
 * ANTHROPIC CLAUDE STREAMING CHATBOT - Optimized API Route
 *
 * Copy this file to: app/api/chat/route.ts
 *
 * Features:
 * - Edge Runtime support
 * - Event-based streaming (Anthropic pattern)
 * - System instruction handling
 * - Proper cleanup and timeout handling
 *
 * Environment: .env.local
 *   ANTHROPIC_API_KEY=sk-ant-...
 *
 * Dependencies:
 *   npm install @anthropic-ai/sdk
 *
 * Models: claude-sonnet-4-20250514, claude-opus-4-20250514, claude-haiku-4-5-20250514
 *
 * Latest models (2025):
 *   claude-sonnet-4 (Sonnet 4 - May 2025)
 *   claude-opus-4 (Opus 4 - May 2025)
 *
 * Vercel Best Practices Applied:
 * - async-defer-await: Await only when needed
 * - server-parallel-fetching: Early stream start
 */

import Anthropic from '@anthropic-ai/sdk';

// Module-level client for connection pooling
const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export const runtime = 'edge';
export const maxDuration = 30;

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface ChatRequest {
  messages: ChatMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
}

interface StreamChunk {
  content?: string;
  done?: boolean;
  error?: string;
}

export async function POST(req: Request) {
  try {
    const body: ChatRequest = await req.json();

    // Early validation
    if (!body.messages || !Array.isArray(body.messages)) {
      return new Response(
        JSON.stringify({ error: 'Messages must be an array' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Extract system message and filter for API
    const systemMessage = body.messages.find(
      (m) => m.role === 'system'
    )?.content;
    const chatMessages = body.messages.filter(
      (m) => m.role !== 'system'
    );

    const model = body.model ?? 'claude-sonnet-4-5-20250514';
    const temperature = body.temperature ?? 0.7;
    const maxTokens = body.maxTokens ?? 4096;

    // Start stream immediately
    const stream = await anthropic.messages.stream({
      model,
      max_tokens: maxTokens,
      temperature,
      system: systemMessage,
      messages: chatMessages,
    });

    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();
          let timeoutId: ReturnType<typeof setTimeout> | undefined;

          // Cleanup function
          const cleanup = () => {
            if (timeoutId) clearTimeout(timeoutId);
          };

          // Anthropic uses event-based streaming (high-level API)
          // The 'text' event provides streaming text chunks
          stream.on('text', (text: string) => {
            const data: StreamChunk = { content: text };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
            );
          });

          stream.on('end', () => {
            const doneData: StreamChunk = { done: true };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(doneData)}\n\n`)
            );
            controller.close();
            cleanup();
          });

          stream.on('error', (error: Error) => {
            const errorData: StreamChunk = {
              error: error.message,
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`)
            );
            controller.close();
            cleanup();
          });

          // Timeout protection (60 seconds)
          timeoutId = setTimeout(() => {
            stream.controller.abort();
            controller.close();
            cleanup();
          }, 60000);
        },
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
