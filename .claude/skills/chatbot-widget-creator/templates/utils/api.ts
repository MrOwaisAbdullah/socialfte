import { ChatRequest, ChatResponse, SourceCitation } from '../types';

// API configuration
export const API_CONFIG = {
  DEFAULT_TIMEOUT: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3,
  RETRY_DELAY: 1000, // 1 second
  STREAM_CHUNK_TIMEOUT: 5000, // 5 seconds between chunks
};

// API error types
export class APIError extends Error {
  constructor(
    message: string,
    public code: string,
    public retryable: boolean = false,
    public statusCode?: number
  ) {
    super(message);
    this.name = 'APIError';
  }
}

// Helper function to create AbortController with timeout
function createTimeoutController(timeoutMs: number): AbortController {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort(new Error('Request timeout'));
  }, timeoutMs);

  // Store timeout ID for cleanup
  (controller as any)._timeoutId = timeoutId;
  return controller;
}

// Helper function to clean up timeout
function clearTimeoutController(controller: AbortController): void {
  const timeoutId = (controller as any)._timeoutId;
  if (timeoutId) {
    clearTimeout(timeoutId);
  }
}

// Main API client
export class ChatAPIClient {
  private baseUrl: string;
  private defaultHeaders: Record<string, string>;

  constructor(baseUrl: string = '/api/chat') {
    this.baseUrl = baseUrl;
    this.defaultHeaders = {
      'Content-Type': 'application/json',
      'Accept': 'text/event-stream',
    };
  }

  // Helper method to handle API responses
  private async handleResponse<T>(response: Response, endpoint: string): Promise<T> {
    if (!response.ok) {
      const errorText = await response.text();
      throw new APIError(
        `API Error (${response.status}): ${errorText}`,
        `HTTP_${response.status}`,
        response.status >= 500 && response.status < 600, // Retry server errors
        response.status
      );
    }

    const contentType = response.headers.get('content-type');

    if (contentType?.includes('application/json')) {
      return response.json() as Promise<T>;
    }

    if (contentType?.includes('text/event-stream')) {
      // Handle SSE streams
      const text = await response.text();
      return text as unknown as T;
    }

    return response.text() as unknown as T;
  }

  // Send streaming message
  async sendStreamingMessage(request: ChatRequest): Promise<void> {
    const controller = createTimeoutController(API_CONFIG.DEFAULT_TIMEOUT);

    try {
      const response = await fetch(`${this.baseUrl}/stream`, {
        method: 'POST',
        headers: this.defaultHeaders,
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      await this.handleResponse<void>(response, 'stream');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new APIError('Request timeout', 'TIMEOUT', true);
      }
      throw error;
    } finally {
      clearTimeoutController(controller);
    }
  }

  // Send non-streaming message
  async sendMessage(request: ChatRequest): Promise<ChatResponse> {
    const controller = createTimeoutController(API_CONFIG.DEFAULT_TIMEOUT);

    try {
      const response = await fetch(`${this.baseUrl}`, {
        method: 'POST',
        headers: {
          ...this.defaultHeaders,
          'Accept': 'application/json',
        },
        body: JSON.stringify(request),
        signal: controller.signal,
      });

      return await this.handleResponse<ChatResponse>(response, 'chat');
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new APIError('Request timeout', 'TIMEOUT', true);
      }
      throw error;
    } finally {
      clearTimeoutController(controller);
    }
  }

  // Health check
  async healthCheck(): Promise<boolean> {
    try {
      const controller = createTimeoutController(5000); // 5 second timeout

      const response = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
      });

      clearTimeoutController(controller);
      return response.ok;
    } catch (error) {
      return false;
    }
  }
}

// Streaming response parser
export class StreamingResponseParser {
  private buffer: string = '';
  private onChunk: (chunk: string) => void;
  private onComplete: () => void;
  private onError: (error: Error) => void;

  constructor(options: {
    onChunk: (chunk: string) => void;
    onComplete: () => void;
    onError: (error: Error) => void;
  }) {
    this.onChunk = options.onChunk;
    this.onComplete = options.onComplete;
    this.onError = options.onError;
  }

  parse(data: string): void {
    try {
      this.buffer += data;

      // Process complete SSE messages
      const lines = this.buffer.split('\n');
      this.buffer = lines.pop() || ''; // Keep incomplete line in buffer

      for (const line of lines) {
        if (line.trim() === '') continue;

        if (line.startsWith('data: ')) {
          const data = line.substring(6).trim();

          // Handle SSE control messages
          if (data === '[DONE]') {
            this.onComplete();
            return;
          }

          if (data === '[ERROR]') {
            this.onError(new Error('Stream error from server'));
            return;
          }

          // Parse JSON chunk
          try {
            const parsed = JSON.parse(data);
            // Handle different response formats
            if (typeof parsed === 'string') {
              this.onChunk(parsed);
            } else if (parsed.content) {
              this.onChunk(parsed.content);
            } else if (parsed.message) {
              this.onChunk(parsed.message);
            } else if (parsed.text) {
              this.onChunk(parsed.text);
            } else if (parsed.choices && parsed.choices[0]?.delta?.content) {
              // OpenAI streaming format
              this.onChunk(parsed.choices[0].delta.content);
            } else if (parsed.data && parsed.data.content) {
              this.onChunk(parsed.data.content);
            } else if (parsed.response) {
              this.onChunk(parsed.response);
            } else {
              // If it's an object but no recognized content field
              // Try to extract meaningful content or provide a fallback
              console.warn('Unknown streaming response format:', parsed);
              const content = parsed.content || parsed.message || parsed.text || parsed.response || 'Received a response';
              this.onChunk(typeof content === 'string' ? content : 'Invalid response format');
            }
          } catch (parseError) {
            // If not JSON, treat as plain text but clean it up
            if (data === '[object Object]') {
              console.error('Received [object Object] as response');
              this.onChunk('Error: Invalid response format');
            } else {
              this.onChunk(data);
            }
          }
        } else if (line.startsWith('error: ')) {
          const errorMsg = line.substring(7).trim();
          this.onError(new Error(errorMsg));
          return;
        }
      }
    } catch (error) {
      this.onError(error instanceof Error ? error : new Error('Unknown parsing error'));
    }
  }

  reset(): void {
    this.buffer = '';
  }
}

// Retry mechanism
export async function withRetry<T>(
  operation: () => Promise<T>,
  maxAttempts: number = API_CONFIG.RETRY_ATTEMPTS,
  delay: number = API_CONFIG.RETRY_DELAY
): Promise<T> {
  let lastError: Error;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('Unknown error');

      // Don't retry if it's the last attempt or if error is not retryable
      if (attempt === maxAttempts || (error instanceof APIError && !error.retryable)) {
        throw lastError;
      }

      // Wait before retrying (with exponential backoff)
      const retryDelay = delay * Math.pow(2, attempt - 2);
      await new Promise(resolve => setTimeout(resolve, retryDelay));
    }
  }

  throw lastError!;
}

// Utility function to format API request with context
export function formatChatRequest(
  message: string,
  selectedText?: string,
  source?: string
): ChatRequest {
  const request: ChatRequest = {
    question: message, // Changed from 'message' to 'question' to match backend
    stream: true,
  };

  if (selectedText && selectedText.trim()) {
    request.context = {
      selectedText: selectedText.trim(),
      source: source || 'User selection',
    };
  }

  return request;
}

// Export singleton instance
export const chatAPI = new ChatAPIClient();