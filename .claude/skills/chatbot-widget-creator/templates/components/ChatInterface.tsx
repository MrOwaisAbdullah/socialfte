import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChatMessage as ChatMessageType } from '../types';
import WelcomeScreen from './WelcomeScreen';
import MessageBubble from './MessageBubble';
import InputArea from './InputArea';
import ThinkingIndicator from './ThinkingIndicator';
import { getOptimizedMotionProps, widgetVariants } from '../utils/animations';
import styles from '../styles/ChatWidget.module.css';

interface ChatInterfaceProps {
  messages: ChatMessageType[];
  onSendMessage: (content: string) => void;
  onClose: () => void;
  isThinking: boolean;
  error: {
    error: Error | null;
    isVisible: boolean;
    canRetry: boolean;
    retryCount: number;
  };
  onRetry?: () => void;
  onDismissError?: () => void;
}

// Error display component
function ErrorDisplay({ error, onRetry, onDismiss }: {
  error: Error;
  onRetry?: () => void;
  onDismiss?: () => void;
}) {
  return (
    <motion.div
      className={styles.errorState}
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.9, y: -10 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <motion.svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        animate={{ rotate: [0, 10, -10, 0] }}
        transition={{ duration: 0.5, repeat: 2, repeatDelay: 1 }}
      >
        <circle cx="12" cy="12" r="10"/>
        <line x1="15" y1="9" x2="9" y2="15"/>
        <line x1="9" y1="9" x2="15" y2="15"/>
      </motion.svg>
      <span>{error.message}</span>
      {onRetry && (
        <motion.button
          className={styles.retryButton}
          onClick={onRetry}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          transition={{ duration: 0.1 }}
        >
          Try Again
        </motion.button>
      )}
      {onDismiss && (
        <motion.button
          className={styles.closeButton}
          onClick={onDismiss}
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.1 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </motion.button>
      )}
    </motion.div>
  );
}

// Main ChatInterface component
export default function ChatInterface({
  messages,
  onSendMessage,
  onClose,
  isThinking,
  error,
  onRetry,
  onDismissError,
}: ChatInterfaceProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages are added
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  return (
    <motion.div
      {...getOptimizedMotionProps(widgetVariants)}
      className={styles.widget}
      initial="hidden"
      animate="visible"
      exit="exit"
    >
      {/* Header */}
      <motion.div
        className={styles.header}
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3, ease: "easeOut" }}
      >
        <motion.h2
          className={styles.title}
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
        >
          Chat
        </motion.h2>
        <motion.button
          onClick={onClose}
          className={styles.closeButton}
          aria-label="Close chat dialog (Escape)"
          title="Close chat dialog (Escape)"
          initial={{ opacity: 0, x: 10 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.1, duration: 0.3 }}
          whileHover={{ scale: 1.1, rotate: 90 }}
          whileTap={{ scale: 0.9 }}
          transition={{ duration: 0.1 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </motion.button>
      </motion.div>

      {/* Message Container */}
      <motion.div
        className={styles.messageContainer}
        role="log"
        aria-label="Chat messages"
        aria-live="polite"
        aria-relevant="additions text"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2, duration: 0.3 }}
      >
        {messages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.3 }}
          >
            <WelcomeScreen onSuggestionClick={onSendMessage} />
          </motion.div>
        ) : (
          <>
            {messages.map((message, index) => (
              <MessageBubble
                key={message.id}
                message={message}
                isStreaming={message.isStreaming}
              />
            ))}
          </>
        )}

        {/* Thinking indicator */}
        <AnimatePresence>
          {isThinking && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <ThinkingIndicator />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error display */}
        <AnimatePresence>
          {error.isVisible && error.error && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{ duration: 0.3 }}
            >
              <ErrorDisplay
                error={error.error}
                onRetry={error.canRetry ? onRetry : undefined}
                onDismiss={onDismissError}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Auto-scroll anchor */}
        <div ref={messagesEndRef} />
      </motion.div>

      {/* Input Area */}
      <InputArea
        onSendMessage={onSendMessage}
        disabled={isThinking}
      />
    </motion.div>
  );
}