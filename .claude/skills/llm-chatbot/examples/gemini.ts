/**
 * GOOGLE GEMINI STREAMING CHATBOT - Optimized API Route
 *
 * Copy this file to: app/api/chat/route.ts
 *
 * Features:
 * - Edge Runtime support
 * - Async iterator streaming
 * - System instruction support
 * - Proper message format transformation
 *
 * Environment: .env.local
 *   GEMINI_API_KEY=...
 *
 * Dependencies:
 *   npm install @google/genai
 *
 * Models: gemini-2.5-flash, gemini-2.5-pro, gemini-1.5-flash, gemini-1.5-pro
 *
 * IMPORTANT: Gemini uses unique message format:
 * - role: 'model' instead of 'assistant'
 * - parts: [{ text }] instead of content string
 *
 * Vercel Best Practices Applied:
 * - async-parallel: Stream processing in parallel
 * - server-parallel-fetching: Early response start
 */

import { GoogleGenAI } from '@google/genai';

// Module-level client for connection pooling
const genAI = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY || '',
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
}

interface StreamChunk {
  content?: string;
  done?: boolean;
  error?: string;
}

// Transform messages to Gemini format
function transformMessages(messages: ChatMessage[]): Array<{
  role: 'user' | 'model';
  parts: Array<{ text: string }>;
}> {
  return messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));
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

    // Extract system instruction
    const systemInstruction = body.messages.find(
      (m) => m.role === 'system'
    )?.content;

    // Transform messages to Gemini format
    const transformedMessages = transformMessages(body.messages);

    const model = body.model ?? 'gemini-2.5-flash';

    // Get model with system instruction
    const aiModel = genAI.getGenerativeModel({
      model,
      systemInstruction,
    });

    // Start chat with history (all but last message)
    const history = transformedMessages.slice(0, -1);
    const chat = aiModel.startChat({ history });

    // Send the last message and get stream
    const lastMessage = transformedMessages[transformedMessages.length - 1];
    const stream = await chat.sendMessageStream(lastMessage.parts[0].text);

    return new Response(
      new ReadableStream({
        async start(controller) {
          const encoder = new TextEncoder();

          try {
            // Gemini uses async iterator for streaming
            for await (const chunk of stream.stream) {
              const text = chunk.text();

              if (text) {
                const data: StreamChunk = { content: text };
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify(data)}\n\n`)
                );
              }
            }

            // Stream ends naturally
            const doneData: StreamChunk = { done: true };
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify(doneData)}\n\n`)
            );
            controller.close();
          } catch (error) {
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
