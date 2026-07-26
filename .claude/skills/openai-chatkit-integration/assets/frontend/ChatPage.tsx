import React, { useEffect, useState } from 'react';
import { useChatKit, ChatKitProvider } from '@openai/chatkit-react';
import '@openai/chatkit-react/styles.css'; // Ensure styles are imported

const ChatPage = () => {
  const [clientToken, setClientToken] = useState<string | null>(null);

  // 1. Fetch Token from Backend
  useEffect(() => {
    async function fetchToken() {
      try {
        const response = await fetch('http://localhost:8000/chatkit/sessions', {
          method: 'POST',
        });
        const data = await response.json();
        setClientToken(data.clientToken);
      } catch (error) {
        console.error("Failed to fetch client token", error);
      }
    }
    fetchToken();
  }, []);

  // 2. Initialize ChatKit Hook
  // We only initialize when we have a token (or handle loading state)
  const { chatKit } = useChatKit({
    api: {
      // Point to your FastAPI backend
      url: 'http://localhost:8000/chatkit', 
      // domainKey is used for the hosted version, but for custom backend
      // it might be optional or used for custom auth headers depending on implementation.
      // For fully custom backends, the 'url' is the key config.
    },
    clientToken: clientToken, 
  });

  if (!clientToken) {
    return <div>Loading Chat...</div>;
  }

  // 3. Render
  return (
    <div style={{ height: '100vh', width: '100vw' }}>
      <ChatKitProvider>
        {/* Render the default widget */}
        {chatKit.renderWidget({
           theme: 'light', // or 'dark'
           title: 'RAG Assistant',
        })}
      </ChatKitProvider>
    </div>
  );
};

export default ChatPage;
