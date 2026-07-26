/**
 * Chat Provider Component
 *
 * This is a wrapper around the context implementation from contexts/index.ts
 * It provides additional features like error boundaries and performance monitoring.
 */

import React from 'react';
import { ChatProvider as BaseChatProvider, useChatState } from './contexts/index';
import { ErrorBoundary } from './components/ErrorBoundary';
import { withPerformanceMonitoring } from './utils/performanceMonitor';
import { ChatWidgetConfig } from './types/index';

interface ChatProviderWrapperProps {
  children: React.ReactNode;
  config?: ChatWidgetConfig;
  enableErrorBoundary?: boolean;
  enablePerformanceMonitoring?: boolean;
}

/**
 * Enhanced ChatProvider with additional features
 */
function ChatProviderWithFeatures({
  children,
  config,
  enableErrorBoundary = true,
  enablePerformanceMonitoring = process.env.NODE_ENV === 'development'
}: ChatProviderWrapperProps) {
  // Initialize state with config values
  const initialState = React.useMemo(() => ({
    sessionId: config?.maxMessages ? `session_${Date.now()}` : '',
    // Add other config-based initial state as needed
  }), [config]);

  const content = React.createElement(
    BaseChatProvider,
    { initialState },
    children
  );

  // Wrap with error boundary if enabled
  if (enableErrorBoundary) {
    return React.createElement(
      ErrorBoundary,
      {
        fallback: React.createElement(
          'div',
          {
            style: {
              padding: '20px',
              textAlign: 'center',
              color: '#d63031'
            }
          },
          React.createElement('h3', null, 'Chat temporarily unavailable'),
          React.createElement('p', null, 'Please refresh the page or try again later.')
        ),
        onError: (error: Error, errorInfo: React.ErrorInfo) => {
          // Report to error tracking service if enabled
          if (config?.enableErrorReporting) {
            console.error('Chat Error:', error, errorInfo);
            // TODO: Send to error tracking service
          }
        }
      },
      content
    );
  }

  return content;
}

/**
 * Component to monitor chat performance
 */
function ChatPerformanceMonitor({ children }: { children: React.ReactNode }) {
  const { state } = useChatState();
  const renderCountRef = React.useRef(0);

  React.useEffect(() => {
    renderCountRef.current++;

    // Log performance warnings
    if (process.env.NODE_ENV === 'development') {
      if (renderCountRef.current > 100) {
        console.warn(`ChatProvider has rendered ${renderCountRef.current} times`, {
          messagesCount: state.messages.length,
          hasError: !!state.error,
          isStreaming: !!state.currentStreamingId
        });
      }
    }
  });

  return React.createElement(React.Fragment, null, children);
}

/**
 * Export the main ChatProvider component
 */
export const ChatProvider = withPerformanceMonitoring(
  ChatProviderWithFeatures,
  'ChatProvider'
);

/**
 * Export a version with performance monitoring for development
 */
export const ChatProviderWithMonitoring = ({ children, ...props }: ChatProviderWrapperProps) => (
  <ChatProvider {...props}>
    <ChatPerformanceMonitor>
      {children}
    </ChatPerformanceMonitor>
  </ChatProvider>
);

/**
 * Default export
 */
export default ChatProvider;