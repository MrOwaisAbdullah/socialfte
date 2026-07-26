/**
 * OPENROUTER STREAMING CHATBOT - Optimized API Route
 *
 * Copy this file to: app/api/chat/route.ts
 *
 * Features:
 * - Edge Runtime support
 * - Access to 100+ models via single API
 * - OpenAI-compatible interface
 * - Provider-specific headers for rankings
 *
 * Environment: .env.local
 *   OPENROUTER_API_KEY=sk-or-...
 *   NEXT_PUBLIC_SITE_URL=http://localhost:3000
 *   NEXT_PUBLIC_SITE_NAME=My App
 *
 * Dependencies:
 *   npm install openai
 *
 * Popular Models:
 *   - anthropic/claude-opus-4.5
 *   - anthropic/claude-sonnet-4.5
 *   - openai/gpt-4-turbo
 *   - google/gemini-pro-1.5
 *   - meta-llama/llama-3.3-70b-instruct
 *
 * Free Models:
 *   - google/gemma-2-9b-it:free
 *   - meta-llama/llama-3-8b-instruct:free
 */

import OpenAI from "openai";

const openrouter = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: process.env.OPENROUTER_API_KEY,
  defaultHeaders: {
    "HTTP-Referer": process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
    "X-Title": process.env.NEXT_PUBLIC_SITE_NAME || "My App",
  },
});

export const runtime = "edge";
export const maxDuration = 30;

interface ChatMessage {
  role: "system" | "user" | "assistant";
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

    if (!body.messages || !Array.isArray(body.messages)) {
      return new Response(
        JSON.stringify({ error: "Messages must be an array" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const model = body.model ?? "anthropic/claude-sonnet-4";
    const temperature = body.temperature ?? 0.7;
    const maxTokens = body.maxTokens ?? 4096;

    const stream = await openrouter.chat.completions.create({
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
            const errorData: StreamChunk = {
              error: error instanceof Error ? error.message : "Stream error",
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
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        },
      }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}
