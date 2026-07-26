import React from 'react';
import { motion } from 'framer-motion';
import styles from '../styles/ChatWidget.module.css';

interface WelcomeScreenProps {
  onSuggestionClick?: (suggestion: string) => void;
}

// Static suggestions matching the reference design
const suggestions = [
  {
    text: "Explain Physical AI",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 18a8 8 0 1 1 8-8 8 8 0 0 1-8 8z"/>
        <path d="M12 6v6l4 2"/>
      </svg>
    )
  },
  {
    text: "What is Embodied Intelligence?",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M2 20h.01"/>
        <path d="M7 20v-4"/>
        <path d="M12 20v-8"/>
        <path d="M17 20V8"/>
        <path d="M22 4v16"/>
      </svg>
    )
  },
  {
    text: "Summarize Chapter 1",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
    )
  },
  {
    text: "How do sensors work in robotics?",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
        <circle cx="12" cy="10" r="3"/>
      </svg>
    )
  },
  {
    text: "Explain ROS 2 Architecture",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <rect x="2" y="2" width="20" height="8" rx="2" ry="2"/>
        <rect x="2" y="14" width="20" height="8" rx="2" ry="2"/>
        <line x1="6" y1="6" x2="6.01" y2="6"/>
        <line x1="6" y1="18" x2="6.01" y2="18"/>
      </svg>
    )
  }
];

export default function WelcomeScreen({ onSuggestionClick }: WelcomeScreenProps) {
  const handleSuggestionClick = (suggestion: string) => {
    if (onSuggestionClick) {
      onSuggestionClick(suggestion);
    }
  };

  return (
    <div className={styles.welcomeScreen}>
      <motion.h4
        className={styles.welcomeTitle}
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        What can I help with today?
      </motion.h4>

      {/* Suggestion buttons with icons matching reference design */}
      <motion.div
        className={styles.suggestions}
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1, duration: 0.3 }}
      >
        {suggestions.map((suggestion, index) => (
          <motion.button
            key={index}
            className={styles.suggestion}
            onClick={() => handleSuggestionClick(suggestion.text)}
            aria-label={`Ask: ${suggestion.text}`}
            title={`Ask: ${suggestion.text}`}
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.1 + index * 0.05, duration: 0.2 }}
            whileHover={{
              scale: 1.02,
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              transition: { duration: 0.15 }
            }}
            whileTap={{ scale: 0.98 }}
          >
            <span className={styles.suggestionIcon} style={{ opacity: 0.7 }}>
              {suggestion.icon}
            </span>
            <span className={styles.suggestionText}>{suggestion.text}</span>
          </motion.button>
        ))}
      </motion.div>
    </div>
  );
}