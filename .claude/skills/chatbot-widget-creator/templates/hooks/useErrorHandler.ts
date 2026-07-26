import { useState, useCallback } from 'react';
import { APIError } from '../utils/api';

interface ErrorState {
  error: APIError | null;
  isVisible: boolean;
  canRetry: boolean;
  retryCount: number;
}

interface UseErrorHandlerOptions {
  maxRetries?: number;
  onRetry?: () => void;
  onDismiss?: () => void;
}

interface UseErrorHandlerReturn {
  errorState: ErrorState;
  handleError: (error: Error) => void;
  clearError: () => void;
  retry: () => void;
  dismissError: () => void;
}

export function useErrorHandler(options: UseErrorHandlerOptions = {}): UseErrorHandlerReturn {
  const { maxRetries = 3, onRetry, onDismiss } = options;

  const [errorState, setErrorState] = useState<ErrorState>({
    error: null,
    isVisible: false,
    canRetry: false,
    retryCount: 0,
  });

  const handleError = useCallback((error: Error) => {
    let apiError: APIError;

    if (error instanceof APIError) {
      apiError = error;
    } else {
      // Convert generic error to APIError
      apiError = new APIError(
        error.message || 'Unknown error occurred',
        'UNKNOWN_ERROR',
        true, // Assume retryable for unknown errors
        undefined
      );
    }

    setErrorState({
      error: apiError,
      isVisible: true,
      canRetry: apiError.retryable && (errorState.retryCount < maxRetries),
      retryCount: errorState.retryCount + 1,
    });
  }, [errorState.retryCount, maxRetries]);

  const clearError = useCallback(() => {
    setErrorState({
      error: null,
      isVisible: false,
      canRetry: false,
      retryCount: 0,
    });
  }, []);

  const retry = useCallback(() => {
    if (errorState.canRetry && onRetry) {
      setErrorState(prev => ({
        ...prev,
        isVisible: false,
      }));
      onRetry();
    }
  }, [errorState.canRetry, onRetry]);

  const dismissError = useCallback(() => {
    setErrorState(prev => ({
      ...prev,
      isVisible: false,
    }));
    onDismiss?.();
  }, [onDismiss]);

  return {
    errorState,
    handleError,
    clearError,
    retry,
    dismissError,
  };
}

// Error message formatter
export function formatErrorMessage(error: APIError): string {
  // Provide user-friendly error messages based on error codes
  switch (error.code) {
    case 'NETWORK_ERROR':
      return 'Network connection error. Please check your internet connection and try again.';
    case 'TIMEOUT':
      return 'Request timed out. The server may be busy. Please try again.';
    case 'HTTP_401':
      return 'Authentication error. Please log in and try again.';
    case 'HTTP_403':
      return 'Permission denied. You don\'t have access to this resource.';
    case 'HTTP_404':
      return 'The requested resource was not found.';
    case 'HTTP_429':
      return 'Too many requests. Please wait a moment and try again.';
    case 'HTTP_500':
    case 'HTTP_502':
    case 'HTTP_503':
      return 'Server error. Please try again later.';
    case 'HTTP_413':
      return 'Request too large. Please shorten your message and try again.';
    case 'STREAM_ERROR':
      return 'Streaming error occurred. Please try again.';
    case 'PARSE_ERROR':
      return 'Failed to process server response. Please try again.';
    default:
      return error.message || 'An unexpected error occurred. Please try again.';
  }
}

// Error classification utility
export function classifyError(error: Error): {
  type: 'network' | 'server' | 'client' | 'authentication' | 'rate_limit' | 'unknown';
  severity: 'low' | 'medium' | 'high' | 'critical';
  retryable: boolean;
} {
  if (error instanceof APIError) {
    // Classify based on status code
    const statusCode = error.statusCode;

    // Network errors (no status code)
    if (!statusCode && error.message.includes('network') || error.message.includes('fetch')) {
      return { type: 'network', severity: 'medium', retryable: true };
    }

    // Client errors (4xx)
    if (statusCode && statusCode >= 400 && statusCode < 500) {
      if (statusCode === 401) {
        return { type: 'authentication', severity: 'high', retryable: false };
      }
      if (statusCode === 429) {
        return { type: 'rate_limit', severity: 'medium', retryable: true };
      }
      return { type: 'client', severity: 'medium', retryable: false };
    }

    // Server errors (5xx)
    if (statusCode && statusCode >= 500 && statusCode < 600) {
      return { type: 'server', severity: 'high', retryable: true };
    }
  }

  // Default classification
  return { type: 'unknown', severity: 'medium', retryable: true };
}

// Retry delay calculator with exponential backoff
export function calculateRetryDelay(retryCount: number, baseDelay: number = 1000): number {
  // Exponential backoff with jitter
  const exponentialDelay = baseDelay * Math.pow(2, retryCount);
  const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
  return Math.min(exponentialDelay + jitter, 30000); // Max 30 seconds
}

// Error tracking utility
export class ErrorTracker {
  private errors: Array<{
    error: Error;
    timestamp: Date;
    context?: string;
  }> = [];

  trackError(error: Error, context?: string): void {
    this.errors.push({
      error,
      timestamp: new Date(),
      context,
    });

    // Keep only last 50 errors
    if (this.errors.length > 50) {
      this.errors = this.errors.slice(-50);
    }
  }

  getRecentErrors(minutes: number = 5): Array<{
    error: Error;
    timestamp: Date;
    context?: string;
  }> {
    const cutoff = new Date(Date.now() - minutes * 60 * 1000);
    return this.errors.filter(entry => entry.timestamp > cutoff);
  }

  getErrorSummary(): {
    total: number;
    recent: number;
    byType: Record<string, number>;
  } {
    const byType: Record<string, number> = {};

    this.errors.forEach(entry => {
      const type = classifyError(entry.error).type;
      byType[type] = (byType[type] || 0) + 1;
    });

    const recentCount = this.getRecentErrors(5).length;

    return {
      total: this.errors.length,
      recent: recentCount,
      byType,
    };
  }

  clear(): void {
    this.errors = [];
  }
}

// Export singleton error tracker
export const errorTracker = new ErrorTracker();