import React, { useCallback, useEffect, useRef } from 'react';
import ChatInterface from './components/ChatInterface';
import ChatButton from './ChatButton';
import SelectionTooltip from './components/SelectionTooltip';
import { useTextSelection } from './hooks/useTextSelection';
import { ChatProvider, useChat, useChatSelector } from './contexts/index';
import { ChatWidgetContainerProps, ChatMessage } from './types';
import { formatChatRequest, APIError } from './utils/api';
import { withPerformanceMonitoring, usePerformanceMonitor } from './utils/performanceMonitor';

interface ChatWidgetContainerInnerProps extends ChatWidgetContainerProps {
  apiUrl?: string;
  maxTextSelectionLength?: number;
  fallbackTextLength?: number;
}

/**
 * Inner component that uses chat context
 * Separated to allow provider wrapper
 */
function ChatWidgetContainerInner({
  apiUrl = '/api/chat',
  maxTextSelectionLength = 2000,
  fallbackTextLength = 5000,
}: ChatWidgetContainerInnerProps) {
  // Use consolidated state management - get all needed methods directly
  const chatContext = useChat();

  // Performance monitoring
  const { renderCount } = usePerformanceMonitor('ChatWidgetContainer');

  // Refs for stable references (prevents re-renders)
  const streamingAbortControllerRef = useRef<AbortController | null>(null);
  const lastMessageRef = useRef<string>('');

  // Selector hooks to prevent unnecessary re-renders
  const isOpen = useChatSelector(s => s.isOpen);
  const messages = useChatSelector(s => s.messages);
  const isThinking = useChatSelector(s => s.isThinking);
  const currentStreamingId = useChatSelector(s => s.currentStreamingId);
  const error = useChatSelector(s => s.error);

  // Transform error to match expected interface
  const errorState = {
    error: error,
    isVisible: !!error,
    canRetry: true,
    retryCount: 0
  };

  // Text selection for "Ask AI" functionality
  const { selection, isTooltipVisible, clearSelection, setIsTooltipVisible } = useTextSelection({
    maxLength: maxTextSelectionLength || 2000,
    enabled: true
  });

  /**
   * Handle streaming data chunk
   * Uses updater function to avoid dependencies on state
   */
  const handleChunk = useCallback((chunk: string) => {
    // Use the action directly from context - no state dependencies needed
    if (chatContext.updateStreaming) {
      chatContext.updateStreaming(chunk);
    } else {
      console.error('updateStreaming is not available in chat context', chatContext);
    }
  }, [chatContext.updateStreaming]);

  /**
   * Handle streaming completion
   */
  const handleComplete = useCallback(() => {
    // Clean up streaming state
    if (chatContext.completeStreaming) {
      chatContext.completeStreaming();
    }

    // Abort any ongoing requests
    if (streamingAbortControllerRef.current) {
      streamingAbortControllerRef.current.abort();
      streamingAbortControllerRef.current = null;
    }
  }, [chatContext.completeStreaming]);

  /**
   * Handle streaming errors
   */
  const handleError = useCallback((error: Error) => {
    console.error('Streaming error:', error);

    // Set streaming error state
    if (chatContext.setStreamingError) {
      chatContext.setStreamingError(error);
    }

    // Clean up
    handleComplete();
  }, [chatContext.setStreamingError, handleComplete]);

  /**
   * Send a message to the AI
   * Consolidates the previous sendStreamingMessage and startStreaming logic
   */
  const handleSendMessage = useCallback(async (content: string) => {
    try {
      // Prevent duplicate messages
      if (content.trim() === lastMessageRef.current.trim()) {
        console.warn('Duplicate message detected:', content);
        return;
      }
      lastMessageRef.current = content;

      // Clear any previous errors
      if (chatContext.clearError) {
        chatContext.clearError();
      }

      // Add user message
      if (!chatContext.addMessage) {
        throw new Error('addMessage is not available');
      }
      chatContext.addMessage({
        content: content.trim(),
        role: 'user'
      });

      // Set thinking state
      if (chatContext.setIsThinking) {
        chatContext.setIsThinking(true);
      }

      // Create AI message placeholder
      if (!chatContext.addMessage || !chatContext.startStreaming) {
        throw new Error('Required chat methods are not available');
      }
      const aiMessageId = chatContext.addMessage({
        content: '',
        role: 'assistant',
        isStreaming: true
      });

      // Start streaming for this message
      chatContext.startStreaming(aiMessageId);

      // Create abort controller for this request
      const abortController = new AbortController();
      streamingAbortControllerRef.current = abortController;

      // Send request to API
      const request = formatChatRequest(content);

      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
        signal: abortController.signal
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body reader available');
      }

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        const chunk = decoder.decode(value, { stream: true });

        // Handle SSE format
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(6);
            if (data !== '[DONE]') {
              try {
                const parsed = JSON.parse(data);

                // Handle different message types from backend
                if (parsed.type === 'chunk' && parsed.content) {
                  handleChunk(parsed.content);
                } else if (parsed.type === 'start') {
                  // Initial metadata, can be ignored for now
                  console.log('Chat session started:', parsed.session_id);
                } else if (parsed.type === 'done') {
                  // Stream completed
                  console.log('Chat completed:', parsed);
                  break;
                }
              } catch (e) {
                // If not JSON, treat as raw text
                handleChunk(data);
              }
            }
          }
        }
      }

      // Complete streaming
      handleComplete();

    } catch (error) {
      // Handle abort specially
      if (error instanceof Error && error.name === 'AbortError') {
        console.log('Streaming aborted');
        return;
      }

      handleError(error instanceof Error ? error : new Error('Failed to send message'));
    }
  }, [
    chatContext,
    apiUrl,
    handleChunk,
    handleComplete,
    handleError
  ]);

  /**
   * Retry the last failed message
   */
  const handleRetry = useCallback(() => {
    // Find the last user message and resend
    const userMessages = messages.filter(msg => msg.role === 'user');
    if (userMessages.length > 0) {
      const lastUserMessage = userMessages[userMessages.length - 1];
      handleSendMessage(lastUserMessage.content);
    }
  }, [messages, handleSendMessage]);

  /**
   * Clear error state
   */
  const handleDismissError = useCallback(() => {
    if (chatContext.clearError) {
      chatContext.clearError();
    }
  }, [chatContext.clearError]);

  /**
   * Close the widget
   */
  const handleClose = useCallback(() => {
    // Abort any ongoing streaming
    if (streamingAbortControllerRef.current) {
      streamingAbortControllerRef.current.abort();
      streamingAbortControllerRef.current = null;
    }

    // Close widget
    if (chatContext.setIsOpen) {
      chatContext.setIsOpen(false);
    }
  }, [chatContext.setIsOpen]);

  /**
   * Toggle the widget open/closed
   */
  const handleToggle = useCallback(() => {
    if (chatContext.setIsOpen) {
      if (isOpen) {
        handleClose();
      } else {
        chatContext.setIsOpen(true);
      }
    }
  }, [isOpen, chatContext.setIsOpen, handleClose]);

  /**
   * Handle "Ask AI" from text selection
   */
  const handleAskAI = useCallback((selectedText: string) => {
    // Open widget if it's closed
    if (!isOpen && chatContext.setIsOpen) {
      chatContext.setIsOpen(true);
    }

    // Create contextual prompt
    const contextualPrompt = `I have a question about this selected text: "${selectedText}"`;

    // Send the message with context (add a small delay to ensure widget is open)
    setTimeout(() => {
      handleSendMessage(contextualPrompt);
    }, 300);
  }, [isOpen, chatContext.setIsOpen, handleSendMessage]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (streamingAbortControllerRef.current) {
        streamingAbortControllerRef.current.abort();
      }
    };
  }, []);

  // Log render info in development
  if (process.env.NODE_ENV === 'development') {
    console.log(`ChatWidgetContainer render #${renderCount}`, {
      messagesCount: messages.length,
      isOpen,
      isThinking,
      streamingId: currentStreamingId,
      hasError: !!error
    });
  }

  // Always render the button, conditionally render the interface
  return React.createElement(
    React.Fragment,
    null,
    // Floating toggle button
    React.createElement(ChatButton, {
      onClick: handleToggle,
      position: 'bottom-right',
      hasSelection: selection.isValid && selection.text.length > 0
    }),
    // Chat interface wrapper with proper z-index (only when open)
    isOpen && React.createElement(
      'div',
      {
        style: {
          position: 'fixed',
          bottom: '100px',
          right: '20px',
          zIndex: 9999,
          fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif'
        }
      },
      React.createElement(ChatInterface, {
        messages: messages,
        onSendMessage: handleSendMessage,
        onClose: handleClose,
        isThinking: isThinking,
        error: errorState,
        onRetry: handleRetry,
        onDismissError: handleDismissError
      })
    ),
    // Selection tooltip for "Ask AI" functionality
    React.createElement(
      'span',
      null,
      React.createElement(SelectionTooltip, {
        rect: selection.rect,
        isTooLong: selection.isTooLong,
        truncatedText: selection.truncatedText,
        fullText: selection.text,
        onAskAI: handleAskAI,
        onClose: clearSelection,
        isVisible: isTooltipVisible
      })
    )
  );
}

/**
 * ChatWidgetContainer with provider and performance monitoring
 */
export default function ChatWidgetContainer(props: ChatWidgetContainerProps) {
  return React.createElement(
    ChatProvider,
    null,
    React.createElement(ChatWidgetContainerInner, props)
  );
}

// Export with performance monitoring for development
export const ChatWidgetContainerWithMonitoring = withPerformanceMonitoring(
  ChatWidgetContainer,
  'ChatWidgetContainer'
);