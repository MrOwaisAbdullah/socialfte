/**
 * Streaming API client for chat endpoints
 * Handles Server-Sent Events style streaming
 */

// CONFIGURE THIS
const API_BASE_URL = process.env.REACT_APP_CHATBOT_API_URL || 'http://localhost:8000';

/**
 * Send chat request with streaming response
 */
export async function* sendChatRequest(message: string): AsyncGenerator<string> {
  const response = await fetch(`${API_BASE_URL}/api/v1/chat`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error('Response body is not readable');
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    yield chunk;
  }
}

/**
 * Send chat request with text selection context
 */
export async function* sendSelectionChatRequest(
  message: string,
  selectedText: string
): AsyncGenerator<string> {
  const context = {
    page_url: window.location.pathname,
    page_title: document.title,
  };

  const response = await fetch(`${API_BASE_URL}/api/v1/chat/selection`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message,
      selected_text: selectedText,
      context,
    }),
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const reader = response.body?.getReader();
  const decoder = new TextDecoder();

  if (!reader) {
    throw new Error('Response body is not readable');
  }

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    const chunk = decoder.decode(value, { stream: true });
    yield chunk;
  }
}