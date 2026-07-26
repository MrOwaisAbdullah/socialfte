import React from 'react';
import { motion } from 'framer-motion';
import { streamingCursorVariants, DURATIONS, EASINGS, shouldReduceMotion } from '../utils/animations';
import styles from '../styles/ChatWidget.module.css';

interface StreamingCursorProps {
  className?: string;
  enabled?: boolean;
}

export default function StreamingCursor({ className = "", enabled = true }: StreamingCursorProps) {
  if (!enabled || shouldReduceMotion()) {
    return null;
  }

  return (
    <motion.span
      className={`${styles.streamingCursor} ${className}`}
      variants={streamingCursorVariants}
      initial="hidden"
      animate="visible"
      exit="hidden"
      aria-hidden="true"
      style={{
        display: 'inline-block',
        width: '2px',
        height: '1.2em',
        backgroundColor: '#10a37f',
        marginLeft: '2px',
        verticalAlign: 'text-bottom',
        borderRadius: '1px',
      }}
    >
      ▊
    </motion.span>
  );
}