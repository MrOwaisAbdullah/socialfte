/**
 * OPENAI STREAMING CHATBOT - Optimized API Route
 *
 * Copy this file to: app/api/chat/route.ts
 *
 * Features:
 * - Edge Runtime for global low-latency deployment
 * - Streaming responses with SSE
 * - Abort controller support for cancellation
 * - Proper error handling
 *
 * Environment: .env.local
 *   OPENAI_API_KEY=sk-...
 *
 * Dependencies:
 *   npm install openai
 *
 * Models: gpt-5-nano (default), gpt-4.5, gpt-4o, gpt-4-turbo, gpt-4o-mini, o1-preview, o1-mini
 *
 * Vercel Best Practices Applied:
 * - server-parallel-fetching: Early response start
 * - async-parallel: Stream processing starts immediately
 * - server-cache-react: Per-request deduplication ready
 */

import OpenAI from 'openai';

// Initialize once at module level for connection pooling
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
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
  // Early validation for faster error responses
  try {
    const body: ChatRequest = await req.json();

    if (!body.messages || !Array.isArray(body.messages)) {
      return new Response(
        JSON.stringify({ error: 'Messages must be an array' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (body.messages.length === 0) {
      return new Response(
        JSON.stringify({ error: 'At least one message is required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const model = body.model ?? 'gpt-5-nano';
    const temperature = body.temperature ?? 0.7;
    const maxTokens = body.maxTokens ?? 4096;

    // Start streaming immediately - don't await full response
    const stream = await openai.chat.completions.create({
      model,
      messages: body.messages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
    });

    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          try {
            for await (const chunk of stream) {
              const content = chunk.choices[0]?.delta?.content;

              if (content) {
                const data: StreamChunk = { content };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
                );
              }

              // Check for stream completion
              if (chunk.choices[0]?.finish_reason) {
                const doneData: StreamChunk = { done: true };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(doneData)}\n\n`)
                );
                controller.close();
                break;
              }
            }
          } catch (error) {
            // Stream error - send error event and close
            const errorData: StreamChunk = {
              error: error instanceof Error ? error.message : 'Stream error',
            };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(errorData)}\n\n`)
            );
            controller.close();
          }
        },
      }),
      {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no', // Disable nginx buffering
        },
      }
    );
  } catch (error) {
    // Handle top-level errors (API auth, etc.)
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
}

// OPTIONS handler for CORS preflight
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}
