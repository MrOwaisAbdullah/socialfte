import React, { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { createPortal } from 'react-dom';
import { getOptimizedMotionProps, tooltipVariants } from '../utils/animations';
import styles from '../styles/ChatWidget.module.css';

interface SelectionTooltipProps {
  rect: DOMRect | null;
  isTooLong: boolean;
  truncatedText: string;
  fullText: string;
  onAskAI: (text: string) => void;
  onClose: () => void;
  isVisible: boolean;
}

export default function SelectionTooltip({
  rect,
  isTooLong,
  truncatedText,
  fullText,
  onAskAI,
  onClose,
  isVisible
}: SelectionTooltipProps) {
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = React.useState({
    top: 0,
    left: 0,
    arrowPosition: 'center' as 'center' | 'left' | 'right'
  });

  // Calculate smart positioning to avoid screen edges
  useEffect(() => {
    if (!rect || !isVisible) return;

    const tooltip = tooltipRef.current;
    if (!tooltip) return;

    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const scrollX = window.pageXOffset;
    const scrollY = window.pageYOffset;

    // Default positioning (above the selection)
    let top = rect.top + scrollY - tooltipRect.height - 10;
    let left = rect.left + scrollX + (rect.width / 2) - (tooltipRect.width / 2);
    let arrowPosition: 'center' | 'left' | 'right' = 'center';

    // Adjust vertical position if tooltip would go above viewport
    if (top < scrollY + 10) {
      // Position below the selection instead
      top = rect.bottom + scrollY + 10;
    }

    // Adjust horizontal position to avoid screen edges
    if (left < scrollX + 10) {
      // Too far left, align with left edge of selection
      left = rect.left + scrollX;
      arrowPosition = 'left';
    } else if (left + tooltipRect.width > scrollX + viewportWidth - 10) {
      // Too far right, align with right edge of selection
      left = rect.right + scrollX - tooltipRect.width;
      arrowPosition = 'right';
    }

    // Final adjustments if still out of bounds
    if (left < scrollX + 10) {
      left = scrollX + 10;
    }
    if (left + tooltipRect.width > scrollX + viewportWidth - 10) {
      left = scrollX + viewportWidth - tooltipRect.width - 10;
    }

    setPosition({ top, left, arrowPosition });
  }, [rect, isVisible]);

  if (!isVisible || !rect) {
    return null;
  }

  const handleAskAI = () => {
    onAskAI(fullText);
    onClose();
  };

  const tooltipContent = (
    <AnimatePresence>
      <motion.div
        ref={tooltipRef}
        {...getOptimizedMotionProps(tooltipVariants)}
        className={`${styles.selectionTooltip} ${styles[position.arrowPosition]}`}
        style={{
          position: 'absolute',
          top: `${position.top}px`,
          left: `${position.left}px`,
          zIndex: 10000
        }}
        initial="hidden"
        animate="visible"
        exit="exit"
      >
        {isTooLong && (
          <motion.div
            className={styles.selectionWarning}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.728-.833-2.498 0L4.308 16.5c-.77.833.192 2.5 1.732 2.5z"/>
            </svg>
            <span>Text truncated to {fullText.length > 2000 ? 2000 : fullText.length} characters</span>
          </motion.div>
        )}

        <motion.div
          className={styles.selectionPreview}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1, duration: 0.2 }}
        >
          {truncatedText}
        </motion.div>

        <motion.div
          className={styles.selectionActions}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.2 }}
        >
          <motion.button
            className={styles.askAiButton}
            onClick={handleAskAI}
            aria-label="Ask AI about selected text"
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            transition={{ duration: 0.1 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>
            </svg>
            Ask AI
          </motion.button>
          <motion.button
            className={styles.closeTooltipButton}
            onClick={onClose}
            aria-label="Close selection tooltip"
            whileHover={{ scale: 1.1, rotate: 90 }}
            whileTap={{ scale: 0.9 }}
            transition={{ duration: 0.1 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </motion.button>
        </motion.div>

        {/* Arrow indicator */}
        <motion.div
          className={styles.tooltipArrow}
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{ opacity: 1, scaleY: 1 }}
          transition={{ delay: 0.2, duration: 0.15, ease: "easeOut" }}
          style={{ transformOrigin: 'bottom' }}
        />
      </motion.div>
    </AnimatePresence>
  );

  // Use React Portal to render tooltip outside component tree
  return createPortal(tooltipContent, document.body);
}