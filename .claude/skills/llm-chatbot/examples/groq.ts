/**
 * GROQ STREAMING CHATBOT - Optimized API Route
 *
 * Copy this file to: app/api/chat/route.ts
 *
 * Features:
 * - Edge Runtime support
 * - OpenAI-compatible API
 * - Fast inference for open-source models
 *
 * Environment: .env.local
 *   GROQ_API_KEY=gsk_...
 *
 * Dependencies:
 *   npm install groq-sdk
 *
 * Models: llama-3.3-70b-versatile, llama-3.1-70b-versatile,
 *         mixtral-8x7b-32768, gemma2-9b-it
 *
 * Note: Groq API is OpenAI-compatible
 */

import Groq from "groq-sdk";

const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY,
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

    const model = body.model ?? "llama-3.3-70b-versatile";
    const temperature = body.temperature ?? 0.7;
    const maxTokens = body.maxTokens ?? 4096;

    const stream = await groq.chat.completions.create({
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
