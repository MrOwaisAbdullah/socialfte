import React, { useState } from 'react';
import { ChatKit, useChatKit } from '@openai/chatkit-react';
import ChatButton from './ChatButton';

// Define styles using CSS variables for theming compatibility
const panelStyles = {
  position: 'fixed' as const,
  bottom: '80px',
  right: '24px',
  width: '400px',
  height: '600px',
  maxHeight: 'calc(100vh - 100px)',
  zIndex: 1000,
  borderRadius: '16px',
  overflow: 'hidden',
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.15)',
  // Glassmorphism base
  background: 'var(--ifm-background-surface-color, #ffffff)',
  border: '1px solid var(--ifm-border-color, #e5e7eb)',
  animation: 'slideUp 0.3s ease-out',
};

const mobileStyles = {
  ...panelStyles,
  width: '100%',
  height: '100%',
  bottom: '0',
  right: '0',
  maxHeight: '100vh',
  borderRadius: '0',
};

/**
 * ChatWidget component powered by OpenAI ChatKit
 * 
 * Requires a backend endpoint to provide the session token.
 */
export default function ChatWidget({
  apiSessionEndpoint = '/api/chatkit/session',
  theme = 'light',
  title = 'AI Assistant'
}: {
  apiSessionEndpoint?: string;
  theme?: 'light' | 'dark';
  title?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  // Handle mobile detection
  React.useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Initialize ChatKit
  const { control } = useChatKit({
    api: {
      // Fetch the client token from your backend
      getClientSecret: async () => {
        try {
          const res = await fetch(apiSessionEndpoint, { method: 'POST' });
          if (!res.ok) throw new Error('Failed to fetch session token');
          const data = await res.json();
          return data.client_secret;
        } catch (err) {
          console.error('ChatKit authentication error:', err);
          return ''; // Handle error appropriately
        }
      },
    },
    theme: {
      colorScheme: theme,
      // Map Docusaurus/Project variables to ChatKit theme
      color: {
        accent: {
          primary: 'var(--ifm-color-primary, #0d9488)', 
          level: 2
        }
      },
      radius: 'round',
      density: 'compact',
      typography: {
        fontFamily: 'var(--ifm-font-family-base, system-ui, sans-serif)'
      }
    },
    startScreen: {
      greeting: `Hello! I'm your ${title}. How can I help you today?`,
      prompts: [
        { label: 'Summarize', prompt: 'Summarize the key concepts of this page', icon: 'book' },
        { label: 'Explain Code', prompt: 'Explain the code examples on this page', icon: 'code' },
        { label: 'Find Topic', prompt: 'Help me find information about...', icon: 'search' },
      ]
    },
  });

  return (
    <>
      {!isOpen && (
        <ChatButton 
          onClick={() => setIsOpen(true)} 
          icon="🤖"
        />
      )}

      {isOpen && (
        <div style={isMobile ? mobileStyles : panelStyles}>
          {/* Custom Header overlay for close button on Mobile */}
          <div style={{ 
            position: 'absolute', 
            top: '12px', 
            right: '12px', 
            zIndex: 1001 
          }}>
            <button 
              onClick={() => setIsOpen(false)}
              style={{
                background: 'rgba(0,0,0,0.1)',
                border: 'none',
                borderRadius: '50%',
                width: '28px',
                height: '28px',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ifm-font-color-base)'
              }}
            >
              ✕
            </button>
          </div>

          {/* ChatKit Component */}
          <ChatKit 
            control={control} 
            className="w-full h-full" 
          />
        </div>
      )}
    </>
  );
}
