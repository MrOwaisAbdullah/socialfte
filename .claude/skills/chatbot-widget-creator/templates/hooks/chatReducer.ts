/**
 * Chat Reducer for Consolidated State Management
 *
 * Handles all state transitions for the chat widget using the useReducer pattern.
 * This prevents infinite re-renders by eliminating multiple useState hooks.
 */

import { ChatState, ChatAction, ChatMessage, SourceCitation, initialChatState } from '../types/index';

/**
 * Helper function to generate unique IDs
 */
function generateId(): string {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Helper function to update message in array immutably
 */
function updateMessageInArray(
  messages: ChatMessage[],
  id: string,
  updates: Partial<ChatMessage>
): ChatMessage[] {
  return messages.map(msg =>
    msg.id === id ? { ...msg, ...updates } : msg
  );
}

/**
 * Main reducer function for chat state
 */
export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case 'ADD_MESSAGE': {
      const newMessage = {
        ...action.payload,
        id: action.payload.id || generateId(),
        timestamp: action.payload.timestamp || new Date()
      };

      // Check if we need to limit message count
      const maxMessages = 100; // Configurable limit
      const messages = [...state.messages, newMessage];

      return {
        ...state,
        messages: messages.length > maxMessages ? messages.slice(-maxMessages) : messages,
        error: null // Clear any previous errors on successful action
      };
    }

    case 'UPDATE_MESSAGE': {
      const { id, content, sources } = action.payload;

      return {
        ...state,
        messages: updateMessageInArray(state.messages, id, {
          content,
          sources: sources || undefined,
          // Mark as complete if updating streaming message
          ...(state.currentStreamingId === id ? { isStreaming: false } : {})
        }),
        error: null
      };
    }

    case 'DELETE_MESSAGE': {
      return {
        ...state,
        messages: state.messages.filter(msg => msg.id !== action.payload)
      };
    }

    case 'CLEAR_MESSAGES': {
      return {
        ...state,
        messages: [],
        currentStreamingId: undefined,
        streamingError: undefined
      };
    }

    case 'SET_IS_OPEN': {
      return {
        ...state,
        isOpen: action.payload
      };
    }

    case 'SET_IS_THINKING': {
      return {
        ...state,
        isThinking: action.payload
      };
    }

    case 'START_STREAMING': {
      return {
        ...state,
        currentStreamingId: action.payload,
        streamingError: undefined
      };
    }

    case 'UPDATE_STREAMING': {
      const content = action.payload;

      if (!state.currentStreamingId) {
        console.warn('UPDATE_STREAMING called without active streaming');
        return state;
      }

      // Find the streaming message and update it
      const streamingMessage = state.messages.find(msg => msg.id === state.currentStreamingId);
      if (!streamingMessage) {
        console.warn('Streaming message not found:', state.currentStreamingId);
        return state;
      }

      return {
        ...state,
        messages: updateMessageInArray(state.messages, state.currentStreamingId, {
          content: streamingMessage.content + content,
          isStreaming: true
        })
      };
    }

    case 'COMPLETE_STREAMING': {
      if (!state.currentStreamingId) {
        console.warn('COMPLETE_STREAMING called without active streaming');
        return state;
      }

      return {
        ...state,
        messages: updateMessageInArray(state.messages, state.currentStreamingId, {
          isStreaming: false
        }),
        currentStreamingId: undefined,
        isThinking: false
      };
    }

    case 'SET_STREAMING_ERROR': {
      return {
        ...state,
        streamingError: action.payload,
        currentStreamingId: undefined,
        isThinking: false
      };
    }

    case 'CLEAR_ERROR': {
      return {
        ...state,
        error: null,
        streamingError: undefined
      };
    }

    case 'SET_SESSION_ID': {
      return {
        ...state,
        sessionId: action.payload,
        sessionCreatedAt: new Date()
      };
    }

    case 'RESET_STATE': {
      return {
        ...initialChatState,
        sessionId: generateId(), // Generate new session ID
        sessionCreatedAt: new Date()
      };
    }

    case 'INCREMENT_RENDER_COUNT': {
      const newRenderCount = state.renderCount + 1;

      // Log warning for excessive renders in development
      if (process.env.NODE_ENV === 'development' && newRenderCount > 50) {
        console.warn(`⚠️ ChatWidget has rendered ${newRenderCount} times`, {
          state: {
            messagesCount: state.messages.length,
            isOpen: state.isOpen,
            isThinking: state.isThinking,
            hasStreamingId: !!state.currentStreamingId,
            hasError: !!state.error
          }
        });
      }

      return {
        ...state,
        renderCount: newRenderCount
      };
    }

    default: {
      // TypeScript exhaustiveness check
      const exhaustiveCheck: never = action;
      console.error('Unknown action type:', exhaustiveCheck);
      return state;
    }
  }
}

/**
 * Action creators for common operations
 */
export const chatActionCreators = {
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>): ChatAction => ({
    type: 'ADD_MESSAGE',
    payload: message as ChatMessage
  }),

  updateMessage: (id: string, content: string, sources?: SourceCitation[]): ChatAction => ({
    type: 'UPDATE_MESSAGE',
    payload: { id, content, sources }
  }),

  deleteMessage: (id: string): ChatAction => ({
    type: 'DELETE_MESSAGE',
    payload: id
  }),

  clearMessages: (): ChatAction => ({
    type: 'CLEAR_MESSAGES'
  }),

  setIsOpen: (open: boolean): ChatAction => ({
    type: 'SET_IS_OPEN',
    payload: open
  }),

  setIsThinking: (thinking: boolean): ChatAction => ({
    type: 'SET_IS_THINKING',
    payload: thinking
  }),

  startStreaming: (messageId: string): ChatAction => ({
    type: 'START_STREAMING',
    payload: messageId
  }),

  updateStreaming: (content: string): ChatAction => ({
    type: 'UPDATE_STREAMING',
    payload: content
  }),

  completeStreaming: (): ChatAction => ({
    type: 'COMPLETE_STREAMING'
  }),

  setStreamingError: (error: Error): ChatAction => ({
    type: 'SET_STREAMING_ERROR',
    payload: error
  }),

  clearError: (): ChatAction => ({
    type: 'CLEAR_ERROR'
  }),

  setSessionId: (sessionId: string): ChatAction => ({
    type: 'SET_SESSION_ID',
    payload: sessionId
  }),

  resetState: (): ChatAction => ({
    type: 'RESET_STATE'
  }),

  incrementRenderCount: (): ChatAction => ({
    type: 'INCREMENT_RENDER_COUNT'
  })
};