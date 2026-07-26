import React from 'react';

interface ChatButtonProps {
  onClick: () => void;
  hasSelection?: boolean;
  icon?: string;
  position?: 'bottom-right' | 'bottom-left';
}

/**
 * Floating chat button
 * Shows in corner with optional notification badge
 * Uses CSS variables for theming to ensure reusability across projects
 */
export default function ChatButton({
  onClick,
  hasSelection = false,
  icon = '💬',
  position = 'bottom-right'
}: ChatButtonProps) {
  const positionClasses = position === 'bottom-left' ? 'left-6' : 'right-6';
  
  return (
    <button
      onClick={onClick}
      className={`fixed bottom-6 ${positionClasses} w-14 h-14 rounded-full text-white border-none text-2xl cursor-pointer shadow-lg z-50 flex items-center justify-center transition-all duration-300 hover:-translate-y-0.5 hover:scale-105 hover:shadow-xl backdrop-blur-sm`}
      style={{
        background: hasSelection 
          ? 'var(--ifm-color-primary-dark)' 
          : 'var(--ifm-color-primary)',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.16)'
      }}
      aria-label="Open Chat"
    >
      {icon}

      {hasSelection && (
        <span 
          className="absolute top-2 right-2 text-white w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
          style={{ backgroundColor: 'var(--ifm-color-danger, #fa383e)' }}
        >
          ✕
        </span>
      )}
    </button>
  );
}