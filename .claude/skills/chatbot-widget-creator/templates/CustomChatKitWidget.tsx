import React, { useState, useEffect } from 'react';
import ChatButton from './ChatButton';

// Custom ChatKit widget that connects to our custom ChatKit server
export default function CustomChatKitWidget({
  apiEndpoint = '/chat',
  title = 'AI Assistant'
}: {
  apiEndpoint?: string;
  title?: string;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [messages, setMessages] = useState<Array<{role: string, content: string}>>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);

  // Ensure component only renders on client side
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Handle mobile detection
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768);
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Generate or retrieve thread ID
  useEffect(() => {
    if (isMounted) {
      let storedThreadId = localStorage.getItem('chatkit_thread_id');
      if (!storedThreadId) {
        storedThreadId = `thread_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        localStorage.setItem('chatkit_thread_id', storedThreadId);
      }
      setThreadId(storedThreadId);
    }
  }, [isMounted]);

  const handleSendMessage = async () => {
    if (!inputValue.trim()) return;

    const userMessage = { role: 'user', content: inputValue };
    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      const response = await fetch(apiEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: inputValue,
          session_id: threadId || undefined,
          stream: true
        })
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let assistantMessage = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const chunk = decoder.decode(value, { stream: true });
          const lines = chunk.split('\n');

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const data = JSON.parse(line.slice(6));
                // Handle different SSE formats
                if (data.answer) {
                  assistantMessage += data.answer;
                  setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage && lastMessage.role === 'assistant') {
                      lastMessage.content = assistantMessage;
                    } else {
                      newMessages.push({ role: 'assistant', content: assistantMessage });
                    }
                    return newMessages;
                  });
                }
                // Also handle chunk format
                else if (data.content) {
                  assistantMessage += data.content;
                  setMessages(prev => {
                    const newMessages = [...prev];
                    const lastMessage = newMessages[newMessages.length - 1];
                    if (lastMessage && lastMessage.role === 'assistant') {
                      lastMessage.content = assistantMessage;
                    } else {
                      newMessages.push({ role: 'assistant', content: assistantMessage });
                    }
                    return newMessages;
                  });
                }
              } catch (e) {
                // Ignore JSON parse errors for partial chunks
              }
            }
          }
        }
      }

      // The assistant message is already added during streaming, no need to add again
    } catch (error) {
      console.error('Error sending message:', error);
      let errorMessage = 'Sorry, I encountered an error. Please try again.';

      // More specific error messages
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch')) {
          errorMessage = 'Unable to connect to the AI service. Please check your internet connection and try again.';
        } else if (error.message.includes('HTTP error! status 404')) {
          errorMessage = 'The AI service is currently unavailable. Please try again later.';
        } else if (error.message.includes('HTTP error! status 429')) {
          errorMessage = 'Too many requests. Please wait a moment and try again.';
        } else if (error.message.includes('CORS')) {
          errorMessage = 'Connection blocked by browser security. Please contact support if this persists.';
        }
      }

      setMessages(prev => [...prev, {
        role: 'assistant',
        content: errorMessage
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

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
    display: 'flex',
    flexDirection: 'column' as const,
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
          {/* Header */}
          <div style={{
            padding: '16px',
            borderBottom: '1px solid var(--ifm-border-color, #e5e7eb)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            background: 'var(--ifm-color-primary-lightest)',
          }}>
            <h3 style={{ margin: 0, fontSize: '18px', fontWeight: '600' }}>
              {title}
            </h3>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: '20px',
                cursor: 'pointer',
                padding: '4px',
                borderRadius: '4px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              ✕
            </button>
          </div>

          {/* Messages */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
          }}>
            {messages.length === 0 && (
              <div style={{
                textAlign: 'center',
                color: 'var(--ifm-font-color-secondary)',
                fontStyle: 'italic',
                marginTop: '20px',
              }}>
                Ask me anything about Physical AI & Humanoid Robotics!
              </div>
            )}
            {messages.map((message, index) => (
              <div
                key={index}
                style={{
                  padding: '12px',
                  borderRadius: '12px',
                  maxWidth: '80%',
                  wordBreak: 'break-word',
                  alignSelf: message.role === 'user' ? 'flex-end' : 'flex-start',
                  background: message.role === 'user'
                    ? 'var(--ifm-color-primary)'
                    : 'var(--ifm-color-emphasis-100)',
                  color: message.role === 'user'
                    ? 'white'
                    : 'var(--ifm-font-color-base)',
                }}
              >
                {message.content}
              </div>
            ))}
            {isLoading && (
              <div style={{
                padding: '12px',
                borderRadius: '12px',
                maxWidth: '80%',
                background: 'var(--ifm-color-emphasis-100)',
                color: 'var(--ifm-font-color-secondary)',
                fontStyle: 'italic',
              }}>
                Thinking...
              </div>
            )}
          </div>

          {/* Input */}
          <div style={{
            padding: '16px',
            borderTop: '1px solid var(--ifm-border-color, #e5e7eb)',
            display: 'flex',
            gap: '8px',
          }}>
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              disabled={isLoading}
              style={{
                flex: 1,
                padding: '12px',
                border: '1px solid var(--ifm-border-color, #e5e7eb)',
                borderRadius: '8px',
                fontSize: '14px',
                outline: 'none',
                background: 'var(--ifm-background-color)',
                color: 'var(--ifm-font-color-base)',
              }}
            />
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !inputValue.trim()}
              style={{
                padding: '12px 20px',
                background: inputValue.trim() && !isLoading
                  ? 'var(--ifm-color-primary)'
                  : 'var(--ifm-color-emphasis-200)',
                color: inputValue.trim() && !isLoading
                  ? 'white'
                  : 'var(--ifm-font-color-secondary)',
                border: 'none',
                borderRadius: '8px',
                cursor: inputValue.trim() && !isLoading ? 'pointer' : 'not-allowed',
                fontSize: '14px',
                fontWeight: '500',
                transition: 'background-color 0.2s',
              }}
            >
              Send
            </button>
          </div>
        </div>
      )}
    </>
  );
}