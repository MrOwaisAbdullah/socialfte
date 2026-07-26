import React, { useState, useEffect, Suspense } from 'react';
import { ChatKit, useChatKit } from '@openai/chatkit-react';
import ChatButton from './ChatButton';

// ChatKit JS SDK integration with custom backend
interface ChatKitConfig {
  apiEndpoint: string;
  title?: string;
  theme?: 'light' | 'dark';
}

function ChatKitComponent({ apiEndpoint, theme, title }: ChatKitConfig) {
  // Initialize ChatKit with custom backend
  const { control, error } = useChatKit({
    api: {
      // Point to your custom backend endpoint
      url: apiEndpoint,

      // Custom fetch to add headers if needed
      fetch: async (url, init) => {
        return fetch(url, {
          ...init,
          headers: {
            ...init?.headers,
            // Add any custom headers your backend needs
            'Content-Type': 'application/json',
          },
        });
      },

      // Since we're using a custom backend, we don't need domain registration
      // The backend just needs to implement the ChatKit protocol
    },

    theme: {
      colorScheme: theme,
      // Customize colors to match your site
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
        { label: 'Summarize', prompt: 'Summarize the key concepts of this page', icon: 'sparkle' },
        { label: 'Explain Code', prompt: 'Explain the code examples on this page', icon: 'square-code' },
        { label: 'Find Topic', prompt: 'Help me find information about...', icon: 'search' },
      ]
    },

    // Error handling
    onError: (error) => {
      console.error('ChatKit error:', error);
    },
  });

  // Handle errors
  if (error) {
    return (
      <div style={{
        height: '100%',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexDirection: 'column',
        padding: '20px',
        textAlign: 'center'
      }}>
        <div style={{ fontSize: '48px', marginBottom: '16px' }}>😞</div>
        <h3 style={{ marginBottom: '12px' }}>Chat Error</h3>
        <p style={{ color: 'var(--ifm-font-color-secondary)' }}>
          {error.message || 'Failed to initialize chat'}
        </p>
      </div>
    );
  }

  // Return ChatKit component
  return <ChatKit control={control} className="w-full h-full" />;
}

export default function ChatKitJSWidget({
  apiEndpoint,
  title = 'AI Assistant',
  theme = 'light'
}: ChatKitConfig) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ensure component only renders on client side
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Handle mobile detection
  useEffect(() => {
    if (!isMounted) return;

    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, [isMounted]);

  // Don't render anything on server side
  if (!isMounted) {
    return null;
  }

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
    background: 'var(--ifm-background-surface-color, #ffffff)',
    border: '1px solid var(--ifm-border-color, #e5e7eb)',
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

  // Show error state
  if (error) {
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
            <div style={{
              padding: '20px',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              alignItems: 'center',
              textAlign: 'center'
            }}>
              <div style={{ fontSize: '48px', marginBottom: '16px' }}>😞</div>
              <h3 style={{ marginBottom: '12px' }}>Chat Error</h3>
              <p style={{ color: 'var(--ifm-font-color-secondary)', marginBottom: '20px' }}>
                {error}
              </p>
              <button
                onClick={() => {
                  setError(null);
                  setIsOpen(false);
                }}
                style={{
                  background: 'var(--ifm-color-primary)',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  padding: '10px 20px',
                  cursor: 'pointer',
                  fontSize: '14px',
                }}
              >
                Close
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

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
          {/* Close button overlay */}
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

          {/* ChatKit component with error boundary */}
          <div style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
          }}>
            <Suspense fallback={
              <div style={{
                flex: 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--ifm-font-color-base)',
              }}>
                <div>Loading...</div>
              </div>
            }>
              <ChatKitComponent
                apiEndpoint={apiEndpoint}
                theme={theme}
                title={title}
              />
            </Suspense>
          </div>
        </div>
      )}
    </>
  );
}