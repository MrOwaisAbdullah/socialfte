import React from 'react';
import { motion } from 'framer-motion';
import { getOptimizedMotionProps, thinkingIndicatorVariants } from '../utils/animations';
import styles from '../styles/ChatWidget.module.css';

interface ThinkingIndicatorProps {
  message?: string;
  className?: string;
}

export default function ThinkingIndicator({
  message = "",
  className = ""
}: ThinkingIndicatorProps) {
  return (
    <motion.div
      className={`${styles.thinkingIndicator} ${className}`}
      role="status"
      aria-live="polite"
      aria-label="AI is thinking..."
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className={styles.thinkingDots}>
        {[0, 1, 2].map((index) => (
          <motion.div
            key={index}
            className={styles.thinkingDot}
            animate={{
              opacity: [0.4, 1, 0.4],
              scale: [0.8, 1, 0.8],
            }}
            transition={{
              duration: 1.4,
              repeat: Infinity,
              delay: index * 0.2,
              ease: "easeInOut"
            }}
          />
        ))}
      </div>
    </motion.div>
  );
}