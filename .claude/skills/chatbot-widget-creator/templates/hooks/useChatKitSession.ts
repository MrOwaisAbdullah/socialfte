import { useState, useCallback } from 'react';
import type { UseChatKitSessionReturn } from '../types';

interface SessionResponse {
  client_secret: string;
  expires_at?: number;
}

/**
 * Hook for managing ChatKit session authentication
 * Fetches client secrets from the backend and handles session lifecycle
 */
export function useChatKitSession(
  endpoint: string = '/api/chatkit/session'
): UseChatKitSessionReturn {
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        // Optional: Add session identifier if needed
        body: JSON.stringify({
          // Add any additional data your backend might need
          // For example: user_id, session_id, etc.
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.message || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data: SessionResponse = await response.json();

      if (!data.client_secret) {
        throw new Error('No client_secret received from server');
      }

      setClientSecret(data.client_secret);
      return data.client_secret;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Failed to fetch session token');
      setError(error);
      setClientSecret(null);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [endpoint]);

  const refreshSession = useCallback(async (): Promise<void> => {
    await fetchClientSecret();
  }, [fetchClientSecret]);

  return {
    clientSecret,
    isLoading,
    error,
    refreshSession: refreshSession,
  };
}