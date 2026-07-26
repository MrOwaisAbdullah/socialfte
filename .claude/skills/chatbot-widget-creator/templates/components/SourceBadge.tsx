import React from 'react';
import styles from '../styles/ChatWidget.module.css';

interface SourceBadgeProps {
  chapter: string;
  section?: string;
  url?: string;
  onClick?: () => void;
}

export default function SourceBadge({
  chapter,
  section,
  url,
  onClick
}: SourceBadgeProps) {
  const handleClick = () => {
    // Track analytics if needed
    if (onClick) {
      onClick();
    }

    // Navigate to source if URL is provided
    if (url) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const badgeText = section ? `${chapter}:${section}` : chapter;

  return (
    <button
      className={styles.sourceBadge}
      onClick={handleClick}
      aria-label={`Source: ${badgeText}`}
      title={url ? `Go to source: ${badgeText}` : `Source: ${badgeText}`}
    >
      <svg
        width="12"
        height="12"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className={styles.sourceBadgeIcon}
        aria-hidden="true"
      >
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
        <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
      </svg>
      <span className={styles.sourceBadgeText}>{badgeText}</span>
      {url && (
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={styles.sourceBadgeLinkIcon}
          aria-hidden="true"
        >
          <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
          <path d="M15 3h6v6"/>
          <path d="M10 14L21 3"/>
        </svg>
      )}
    </button>
  );
}