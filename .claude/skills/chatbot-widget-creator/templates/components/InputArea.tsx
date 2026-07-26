import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import styles from '../styles/ChatWidget.module.css';

interface InputAreaProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
  maxLength?: number;
  showCharacterCount?: boolean;
}

export default function InputArea({
  onSendMessage,
  disabled = false,
  placeholder = "Type your message...",
  maxLength = 4000,
  showCharacterCount = true,
}: InputAreaProps) {
  const [inputValue, setInputValue] = useState('');
  const [isComposing, setIsComposing] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea based on content
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      // Reset height to auto to get the natural scrollHeight
      textarea.style.height = 'auto';

      // Calculate new height (max 5 rows for mobile, 8 for desktop)
      const maxHeight = window.innerWidth < 640 ? 120 : 160; // 5 rows * 24px vs 8 rows * 20px
      const newHeight = Math.min(textarea.scrollHeight, maxHeight);

      textarea.style.height = `${newHeight}px`;
    }
  }, []);

  // Handle textarea value changes
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (newValue.length <= maxLength) {
      setInputValue(newValue);
      adjustTextareaHeight();
    }
  }, [maxLength, adjustTextareaHeight]);

  // Handle form submission
  const handleSubmit = useCallback(() => {
    const trimmedInput = inputValue.trim();
    if (trimmedInput && !disabled && !isComposing) {
      onSendMessage(trimmedInput);
      setInputValue('');

      // Reset textarea height
      if (textareaRef.current) {
        textareaRef.current.style.height = 'auto';
      }
    }
  }, [inputValue, disabled, isComposing, onSendMessage]);

  // Handle keyboard shortcuts
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Allow newline on Shift+Enter
        return;
      } else if (e.ctrlKey || e.metaKey) {
        // Submit on Ctrl/Cmd+Enter
        e.preventDefault();
        handleSubmit();
      } else if (!e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Submit on Enter (single line)
        if (inputValue.trim().length > 0) {
          e.preventDefault();
          handleSubmit();
        }
      }
    }
  }, [inputValue, handleSubmit]);

  // Handle IME composition (for international users)
  const handleCompositionStart = useCallback(() => {
    setIsComposing(true);
  }, []);

  const handleCompositionEnd = useCallback(() => {
    setIsComposing(false);
  }, []);

  // Focus textarea when component mounts
  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  // Auto-focus on new messages
  useEffect(() => {
    if (textareaRef.current && !disabled) {
      textareaRef.current.focus();
    }
  }, [disabled]);

  const isSubmitDisabled = disabled || !inputValue.trim() || inputValue.trim().length === 0;
  const characterCount = inputValue.length;
  const isNearLimit = characterCount > maxLength * 0.9;

  return (
    <motion.div
      className={styles.inputContainer}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <motion.div
        className={styles.inputArea}
        whileFocus={{ scale: 1.01 }}
        transition={{ duration: 0.2 }}
      >
        <textarea
          ref={textareaRef}
          value={inputValue}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          onCompositionStart={handleCompositionStart}
          onCompositionEnd={handleCompositionEnd}
          placeholder="Message the AI"
          className={styles.inputField}
          disabled={disabled}
          rows={1}
          maxLength={maxLength}
          aria-label="Message input"
          aria-describedby={showCharacterCount ? 'char-count' : undefined}
        />

        {/* Circular send button */}
        <motion.button
          onClick={handleSubmit}
          disabled={isSubmitDisabled}
          className={`${styles.sendButton} ${styles.sendButtonCircular}`}
          aria-label="Send message"
          title={
            isSubmitDisabled
              ? disabled
                ? 'Please wait...'
                : 'Type a message to send'
              : 'Send message (Enter)'
          }
          whileHover={!isSubmitDisabled ? { scale: 1.05 } : {}}
          whileTap={!isSubmitDisabled ? { scale: 0.95 } : {}}
          animate={isSubmitDisabled ? { opacity: 0.5 } : { opacity: 1 }}
          transition={{ duration: 0.15 }}
        >
          <motion.svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className={styles.sendButtonIcon}
          >
            <path d="M22 2L11 13M22 2l-7 20-4-9-9 4z"/>
          </motion.svg>
        </motion.button>

        {/* Character count for long messages */}
        <AnimatePresence>
          {showCharacterCount && characterCount > maxLength * 0.5 && (
            <motion.div
              id="char-count"
              className={`${styles.characterCount} ${isNearLimit ? styles.characterCountWarning : ''}`}
              aria-live="polite"
              aria-atomic="true"
              initial={{ opacity: 0, y: 5 }}
              animate={{
                opacity: 1,
                y: 0,
                backgroundColor: isNearLimit ? 'rgba(251, 191, 36, 0.1)' : 'transparent'
              }}
              exit={{ opacity: 0, y: 5 }}
              transition={{ duration: 0.2 }}
            >
              {characterCount}/{maxLength}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      </motion.div>
  );
}