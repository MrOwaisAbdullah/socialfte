import { useEffect, useRef, useCallback, useState } from 'react';
import { chatAPI, StreamingResponseParser, APIError } from '../utils/api';
import { ChatRequest } from '../types';

interface UseStreamingResponseOptions {
  apiUrl?: string;
  maxRetries?: number;
  chunkTimeout?: number;
  onError?: (error: Error) => void;
  onChunk?: (chunk: string) => void;
  onComplete?: () => void;
}

interface UseStreamingResponseReturn {
  startStreaming: (request: ChatRequest) => Promise<void>;
  stopStreaming: () => void;
  isStreaming: boolean;
  error: Error | null;
  retryCount: number;
}

export function useStreamingResponse(options: UseStreamingResponseOptions = {}): UseStreamingResponseReturn {
  const {
    apiUrl,
    maxRetries = 3,
    chunkTimeout = 5000,
    onError,
    onChunk,
    onComplete,
  } = options;

  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const parserRef = useRef<StreamingResponseParser | null>(null);
  const chunkTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const stopStreaming = useCallback(() => {
    // Clear all timeouts
    if (chunkTimeoutRef.current) {
      clearTimeout(chunkTimeoutRef.current);
      chunkTimeoutRef.current = null;
    }

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }

    // Abort current request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    // Reset parser
    if (parserRef.current) {
      parserRef.current.reset();
      parserRef.current = null;
    }

    setIsStreaming(false);
    setError(null);
  }, []);

  const startStreaming = useCallback(async (request: ChatRequest) => {
    try {
      // Stop any existing streaming
      stopStreaming();

      setIsStreaming(true);
      setError(null);

      // Create streaming parser
      parserRef.current = new StreamingResponseParser({
        onChunk: (chunk: string) => {
          // Reset chunk timeout
          if (chunkTimeoutRef.current) {
            clearTimeout(chunkTimeoutRef.current);
          }

          // Set new chunk timeout
          chunkTimeoutRef.current = setTimeout(() => {
            setError(new Error('Stream timeout - no data received'));
            stopStreaming();
          }, chunkTimeout);

          // Call custom onChunk callback
          onChunk?.(chunk);
        },
        onComplete: () => {
          // Clear timeouts
          if (chunkTimeoutRef.current) {
            clearTimeout(chunkTimeoutRef.current);
            chunkTimeoutRef.current = null;
          }

          setIsStreaming(false);
          setError(null);
          setRetryCount(0);
          onComplete?.();
        },
        onError: (err: Error) => {
          // Clear timeouts
          if (chunkTimeoutRef.current) {
            clearTimeout(chunkTimeoutRef.current);
            chunkTimeoutRef.current = null;
          }

          setError(err);
          setIsStreaming(false);
          onError?.(err);
        },
      });

      // Create abort controller
      abortControllerRef.current = new AbortController();

      // Start the streaming request
      const response = await fetch(
        `${apiUrl || '/api/chat'}/stream`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'text/event-stream',
          },
          body: JSON.stringify(request),
          signal: abortControllerRef.current.signal,
        }
      );

      if (!response.ok) {
        throw new APIError(
          `HTTP ${response.status}: ${response.statusText}`,
          `HTTP_${response.status}`,
          response.status >= 500,
          response.status
        );
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      // Read the stream
      const readStream = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              // Stream ended naturally
              parserRef.current?.parse('\n\n[DONE]\n');
              break;
            }

            const chunk = decoder.decode(value, { stream: true });
            parserRef.current?.parse(chunk);
          }
        } catch (error) {
          parserRef.current?.onError(error instanceof Error ? error : new Error('Stream reading error'));
        }
      };

      readStream();

    } catch (err) {
      const error = err instanceof Error ? err : new Error('Unknown streaming error');

      setError(error);
      setIsStreaming(false);

      // Determine if we should retry
      if (retryCount < maxRetries && (error instanceof APIError ? error.retryable : true)) {
        setRetryCount(prev => prev + 1);

        // Retry after delay
        retryTimeoutRef.current = setTimeout(() => {
          startStreaming(request);
        }, Math.pow(2, retryCount) * 1000); // Exponential backoff
      } else {
        onError?.(error);
      }
    }
  }, [apiUrl, maxRetries, chunkTimeout, onError, onChunk, onComplete, retryCount, stopStreaming]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopStreaming();
    };
  }, [stopStreaming]);

  return {
    startStreaming,
    stopStreaming,
    isStreaming,
    error,
    retryCount,
  };
}