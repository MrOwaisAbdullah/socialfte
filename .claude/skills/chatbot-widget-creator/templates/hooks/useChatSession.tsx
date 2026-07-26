import { createContext, useContext, useReducer, ReactNode, useCallback, useMemo } from 'react';
import { ChatSession, ChatMessage } from '../types';

// Enhanced chat context type with additional methods
export interface ChatContextType {
  session: ChatSession;
  sendMessage: (content: string) => void;
  sendStreamingMessage: (content: string | { message: string }) => void;
  toggleWidget: () => void;
  closeWidget: () => void;
  openWidget: () => void;
  clearMessages: () => void;
  setThinking: (thinking: boolean) => void;
  updateMessage: (id: string, content: string) => void;
  setStreaming: (id: string, isStreaming: boolean) => void;
}

// Action types for reducer
export type ChatAction =
  | { type: 'TOGGLE_WIDGET' }
  | { type: 'OPEN_WIDGET' }
  | { type: 'CLOSE_WIDGET' }
  | { type: 'SET_THINKING'; payload: boolean }
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; content: string } }
  | { type: 'SET_STREAMING'; payload: { id: string; isStreaming: boolean } }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'SET_ERROR'; payload: string | null }
  | { type: 'ADD_SOURCE_CITATIONS'; payload: { messageId: string; sources: any[] } };

// Initial state
export const initialChatState: ChatSession = {
  messages: [],
  isOpen: false,
  isThinking: false,
  currentStreamingId: undefined,
};

// Reducer function with enhanced functionality
export function chatReducer(state: ChatSession, action: ChatAction): ChatSession {
  switch (action.type) {
    case 'TOGGLE_WIDGET':
      return { ...state, isOpen: !state.isOpen };
    case 'OPEN_WIDGET':
      return { ...state, isOpen: true };
    case 'CLOSE_WIDGET':
      return { ...state, isOpen: false };
    case 'SET_THINKING':
      return { ...state, isThinking: action.payload };
    case 'ADD_MESSAGE':
      return {
        ...state,
        messages: [...state.messages, action.payload],
        isThinking: false,
        currentStreamingId: action.payload.isStreaming ? action.payload.id : undefined,
      };
    case 'UPDATE_MESSAGE':
      return {
        ...state,
        messages: state.messages.map(msg =>
          msg.id === action.payload.id
            ? { ...msg, content: action.payload.content }
            : msg
        ),
      };
    case 'SET_STREAMING':
      return {
        ...state,
        messages: state.messages.map(msg =>
          msg.id === action.payload.id
            ? { ...msg, isStreaming: action.payload.isStreaming }
            : msg
        ),
        currentStreamingId: action.payload.isStreaming ? action.payload.id : undefined,
      };
    case 'ADD_SOURCE_CITATIONS':
      return {
        ...state,
        messages: state.messages.map(msg =>
          msg.id === action.payload.messageId
            ? { ...msg, sources: action.payload.sources }
            : msg
        ),
      };
    case 'CLEAR_MESSAGES':
      return {
        ...state,
        messages: [],
        currentStreamingId: undefined,
      };
    case 'SET_ERROR':
      return {
        ...state,
        isThinking: false,
        currentStreamingId: undefined,
      };
    default:
      return state;
  }
}

// Create chat context
export const ChatContext = createContext<ChatContextType | undefined>(undefined);

// Provider component
export function ChatProvider({ children }: { children: ReactNode }) {
  const [session, dispatch] = useReducer(chatReducer, initialChatState);

  const sendMessage = useCallback(async (content: string) => {
    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      content,
      role: 'user',
      timestamp: new Date(),
    };

    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
    dispatch({ type: 'SET_THINKING', payload: true });

    // API call will be implemented in T010
    return userMessage;
  }, []);

  const sendStreamingMessage = useCallback(async (request: { message: string }) => {
    // Extract the message string from the request object
    const messageContent = typeof request === 'string' ? request : request.message || '';

    const userMessage: ChatMessage = {
      id: `msg_${Date.now()}_user`,
      content: messageContent,
      role: 'user',
      timestamp: new Date(),
    };

    dispatch({ type: 'ADD_MESSAGE', payload: userMessage });
    dispatch({ type: 'SET_THINKING', payload: true });

    // Create AI message for streaming
    const aiMessage: ChatMessage = {
      id: `msg_${Date.now()}_ai`,
      content: '',
      role: 'assistant',
      timestamp: new Date(),
      isStreaming: true,
    };

    dispatch({ type: 'ADD_MESSAGE', payload: aiMessage });

    return { userMessage, aiMessage };
  }, []);

  const toggleWidget = useCallback(() => {
    dispatch({ type: 'TOGGLE_WIDGET' });
  }, []);

  const closeWidget = useCallback(() => {
    dispatch({ type: 'CLOSE_WIDGET' });
  }, []);

  const openWidget = useCallback(() => {
    dispatch({ type: 'OPEN_WIDGET' });
  }, []);

  const clearMessages = useCallback(() => {
    dispatch({ type: 'CLEAR_MESSAGES' });
  }, []);

  const setThinking = useCallback((thinking: boolean) => {
    dispatch({ type: 'SET_THINKING', payload: thinking });
  }, []);

  const updateMessage = useCallback((id: string, content: string) => {
    dispatch({ type: 'UPDATE_MESSAGE', payload: { id, content } });
  }, []);

  const setStreaming = useCallback((id: string, isStreaming: boolean) => {
    dispatch({ type: 'SET_STREAMING', payload: { id, isStreaming } });
  }, []);

  const contextValue = useMemo(() => ({
    session,
    sendMessage,
    sendStreamingMessage,
    toggleWidget,
    closeWidget,
    openWidget,
    clearMessages,
    setThinking,
    updateMessage,
    setStreaming,
  }), [session, sendMessage, sendStreamingMessage, toggleWidget, closeWidget, openWidget, clearMessages, setThinking, updateMessage, setStreaming]);

  return (
    <ChatContext.Provider value={contextValue}>
      {children}
    </ChatContext.Provider>
  );
}

// Custom hook to use chat context
export function useChatSession() {
  const context = useContext(ChatContext);
  if (context === undefined) {
    throw new Error('useChatSession must be used within a ChatProvider');
  }
  return context;
}