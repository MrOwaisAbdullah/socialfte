import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ChatInterface from './ChatInterface';
import SelectionTooltip from './SelectionTooltip';
import { useChatSession } from '../hooks/useChatSession';
import { useStreamingResponse } from '../hooks/useStreamingResponse';
import { useErrorHandler } from '../hooks/useErrorHandler';
import { useTextSelection } from '../hooks/useTextSelection';
import { formatChatRequest, APIError } from '../utils/api';
import { ChatWidgetContainerProps } from '../types';
import { getOptimizedMotionProps, widgetVariants, floatingButtonVariants } from '../utils/animations';
import { AnimationPerformanceMonitor } from '../utils/animations';
import styles from '../styles/ChatWidget.module.css';

interface AnimatedChatWidgetProps extends ChatWidgetContainerProps {
  apiUrl?: string;
  maxTextSelectionLength?: number;
  fallbackTextLength?: number;
}

export default function AnimatedChatWidget({
  apiUrl = '/api/chat',
  maxTextSelectionLength = 2000,
  fallbackTextLength = 5000,
}: AnimatedChatWidgetProps) {
  const { session, sendStreamingMessage, updateMessage, setStreaming, toggleWidget, closeWidget, openWidget } = useChatSession();

  // Text selection hook for "Ask AI" functionality
  const {
    selection,
    isTooltipVisible,
    clearSelection,
    setIsTooltipVisible
  } = useTextSelection({
    maxLength: maxTextSelectionLength,
    debounceMs: 300,
    enabled: true
  });
  const floatingButtonRef = useRef<HTMLButtonElement>(null);
  const widgetRef = useRef<HTMLDivElement>(null);

  // Performance monitoring
  const performanceMonitor = useRef<AnimationPerformanceMonitor | null>(null);

  // Start performance monitoring when widget opens
  useEffect(() => {
    if (session.isOpen && !performanceMonitor.current) {
      performanceMonitor.current = new AnimationPerformanceMonitor();
      performanceMonitor.current.start();
    }

    return () => {
      if (performanceMonitor.current) {
        performanceMonitor.current.stop();
        performanceMonitor.current = null;
      }
    };
  }, [session.isOpen]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      // Ctrl/Cmd + K to open/close chat widget
      if ((event.ctrlKey || event.metaKey) && event.key === 'k') {
        event.preventDefault();
        if (session.isOpen) {
          closeWidget();
        } else {
          toggleWidget();
        }
      }

      // Escape to close widget when open
      if (event.key === 'Escape' && session.isOpen) {
        closeWidget();
      }

      // Tab navigation - focus management
      if (event.key === 'Tab' && session.isOpen) {
        // Add custom tab handling within widget if needed
        // For now, let browser handle natural tab order
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [session.isOpen, toggleWidget, closeWidget]);

  // Focus management when widget opens/closes
  useEffect(() => {
    if (session.isOpen && widgetRef.current) {
      // Focus the input field when widget opens
      const inputElement = widgetRef.current.querySelector('textarea, input') as HTMLTextAreaElement | HTMLInputElement;
      if (inputElement) {
        setTimeout(() => inputElement.focus(), 100);
      }
    } else if (!session.isOpen && floatingButtonRef.current) {
      // Return focus to floating button when widget closes
      setTimeout(() => floatingButtonRef.current?.focus(), 100);
    }
  }, [session.isOpen]);
  const { startStreaming, stopStreaming, isStreaming: streamIsStreaming, error: streamError } = useStreamingResponse({
    apiUrl: `${apiUrl}/stream`,
    maxRetries: 3,
    onChunk: (chunk: string) => {
      // Update the streaming AI message with new content
      if (session.currentStreamingId) {
        updateMessage(session.currentStreamingId, chunk);
      }
    },
    onComplete: () => {
      // Mark streaming as complete
      if (session.currentStreamingId) {
        setStreaming(session.currentStreamingId, false);
      }
    },
    onError: (error) => {
      // Handle streaming errors
      console.error('Streaming error:', error);
      // TODO: Show error to user in UI
    },
  });

  const { errorState, handleError, retry, dismissError } = useErrorHandler({
    maxRetries: 3,
    onRetry: () => {
      // Retry the last message
      if (session.messages.length > 0) {
        const lastMessage = session.messages[session.messages.length - 1];
        if (lastMessage.role === 'user') {
          // Resend the user message
          const request = formatChatRequest(lastMessage.content);
          sendStreamingMessage(request);
        }
      }
    },
  });

  // Handle streaming errors
  if (streamError) {
    handleError(streamError);
  }

  // Handle user message sending
  const handleSendMessage = async (content: string) => {
    try {
      const request = formatChatRequest(content);
      const { aiMessage } = await sendStreamingMessage(request);

      // Start streaming for the AI response
      await startStreaming(request);

      // The AI message will be updated through the streaming callback
    } catch (error) {
      handleError(error instanceof Error ? error : new Error('Failed to send message'));
    }
  };

  // Handle "Ask AI" from text selection
  const handleAskAI = (selectedText: string) => {
    // Open widget if it's closed
    if (!session.isOpen) {
      openWidget();
    }

    // Create contextual prompt
    const contextualPrompt = `I have a question about this selected text: "${selectedText}"`;

    // Send the message with context
    setTimeout(() => {
      handleSendMessage(contextualPrompt);
    }, 300); // Small delay to ensure widget is open
  };

  // Animation variants for the widget
  const widgetVariants = {
    hidden: {
      opacity: 0,
      scale: 0.8,
      y: 20,
      transition: {
        duration: 0.2,
        ease: "easeOut"
      }
    },
    visible: {
      opacity: 1,
      scale: 1,
      y: 0,
      transition: {
        duration: 0.3,
        ease: "easeOut",
        staggerChildren: 0.1
      }
    },
    exit: {
      opacity: 0,
      scale: 0.8,
      y: 20,
      transition: {
        duration: 0.2,
        ease: "easeIn"
      }
    }
  };

  // Animation variants for the floating button
  const buttonVariants = {
    open: {
      rotate: 45,
      scale: 1.1,
      transition: {
        duration: 0.2,
        ease: "easeInOut"
      }
    },
    closed: {
      rotate: 0,
      scale: 1,
      transition: {
        duration: 0.2,
        ease: "easeInOut"
      }
    }
  };

  return (
    <div className={styles.widgetContainer}>
      {/* Floating chat button */}
      <AnimatePresence>
        {!session.isOpen && (
          <motion.button
            ref={floatingButtonRef}
            className={styles.floatingButton}
            onClick={toggleWidget}
            aria-label="Open chat widget (Ctrl+K)"
            title="Chat with AI Assistant (Ctrl+K)"
            {...getOptimizedMotionProps(floatingButtonVariants)}
            initial="closed"
            animate="closed"
            exit="open"
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
          >
            <img 
              src="/ai-humanoid-robotics/img/logo.png" 
              alt="Chat" 
              style={{ width: '32px', height: '32px', objectFit: 'contain' }}
            />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Chat widget */}
      <AnimatePresence>
        {session.isOpen && (
          <motion.div
            ref={widgetRef}
            className={styles.widget}
            role="dialog"
            aria-modal="true"
            aria-label="AI Chat Assistant"
            {...getOptimizedMotionProps(widgetVariants)}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            <ChatInterface
              messages={session.messages}
              onSendMessage={handleSendMessage}
              onClose={closeWidget}
              isThinking={session.isThinking}
              error={errorState}
              onRetry={retry}
              onDismissError={dismissError}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Backdrop overlay for mobile */}
      <AnimatePresence>
        {session.isOpen && (
          <motion.div
            className={styles.backdrop}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={closeWidget}
          />
        )}
      </AnimatePresence>

      {/* Text Selection Tooltip */}
      <SelectionTooltip
        rect={selection.rect}
        isTooLong={selection.isTooLong}
        truncatedText={selection.truncatedText}
        fullText={selection.text}
        onAskAI={handleAskAI}
        onClose={clearSelection}
        isVisible={isTooltipVisible}
      />
    </div>
  );
}