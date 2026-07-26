/**
 * Split Context Implementation for Chat Widget
 *
 * Splits context into StateContext and ActionsContext to prevent unnecessary re-renders.
 * Components that only need state won't re-render when actions change.
 */

import React, { createContext, useContext, ReactNode, useReducer, useRef, useCallback } from 'react';
import { ChatState, ChatAction, ChatStateContextType, ChatActionsContextType, initialChatState } from '../types/index';
import { chatReducer, chatActionCreators } from '../hooks/chatReducer';

// State Context - provides only the state
const ChatStateContext = createContext<ChatStateContextType | null>(null);

// Actions Context - provides only the actions
const ChatActionsContext = createContext<ChatActionsContextType | null>(null);

interface ChatProviderProps {
  children: ReactNode;
  initialState?: Partial<ChatState>;
}

/**
 * Main provider component that manages chat state
 */
export function ChatProvider({ children, initialState = {} }: ChatProviderProps) {
  // Initialize state with provided overrides
  const [state, dispatch] = useReducer(
    chatReducer,
    { ...initialChatState, ...initialState }
  );

  // Ref for stable callback references
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;

  // Memoize actions to prevent unnecessary re-renders
  const actions = React.useMemo<ChatActionsContextType>(() => ({
    addMessage: (message) => {
      const id = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      const timestamp = new Date();
      dispatchRef.current({
        type: 'ADD_MESSAGE',
        payload: { ...message, id, timestamp }
      });
      return id;
    },

    updateMessage: (id, content, sources) => {
      dispatchRef.current({
        type: 'UPDATE_MESSAGE',
        payload: { id, content, sources }
      });
    },

    deleteMessage: (id) => {
      dispatchRef.current({
        type: 'DELETE_MESSAGE',
        payload: id
      });
    },

    clearMessages: () => {
      dispatchRef.current({
        type: 'CLEAR_MESSAGES'
      });
    },

    setIsOpen: (open) => {
      dispatchRef.current({
        type: 'SET_IS_OPEN',
        payload: open
      });
    },

    setIsThinking: (thinking) => {
      dispatchRef.current({
        type: 'SET_IS_THINKING',
        payload: thinking
      });
    },

    startStreaming: (messageId) => {
      dispatchRef.current({
        type: 'START_STREAMING',
        payload: messageId
      });
    },

    updateStreaming: (content) => {
      dispatchRef.current({
        type: 'UPDATE_STREAMING',
        payload: content
      });
    },

    completeStreaming: () => {
      dispatchRef.current({
        type: 'COMPLETE_STREAMING'
      });
    },

    setStreamingError: (error) => {
      dispatchRef.current({
        type: 'SET_STREAMING_ERROR',
        payload: error
      });
    },

    clearError: () => {
      dispatchRef.current({
        type: 'CLEAR_ERROR'
      });
    },

    resetChat: () => {
      dispatchRef.current({
        type: 'RESET_STATE'
      });
    },

    incrementRenderCount: () => {
      dispatchRef.current({
        type: 'INCREMENT_RENDER_COUNT'
      });
    }
  }), []); // Empty dependency array - actions are stable

  return React.createElement(
    ChatStateContext.Provider,
    { value: { state } },
    React.createElement(
      ChatActionsContext.Provider,
      { value: actions },
      children
    )
  );
}

/**
 * Hook to access chat state
 * Components using this hook will re-render when state changes
 */
export function useChatState(): ChatStateContextType {
  const context = useContext(ChatStateContext);
  if (!context) {
    throw new Error('useChatState must be used within a ChatProvider');
  }
  return context;
}

/**
 * Hook to access chat actions
 * Components using this hook will NOT re-render when state changes
 */
export function useChatActions(): ChatActionsContextType {
  const context = useContext(ChatActionsContext);
  if (!context) {
    throw new Error('useChatActions must be used within a ChatProvider');
  }
  return context;
}

/**
 * Hook to access both state and actions
 * Use sparingly as it will re-render on state changes
 */
export function useChat(): ChatStateContextType & ChatActionsContextType {
  const stateContext = useChatState();
  const actionsContext = useChatActions();

  return React.useMemo(() => ({
    ...stateContext,
    ...actionsContext
  }), [stateContext, actionsContext]);
}

/**
 * Higher-order component to provide chat context
 */
export function withChatContext<P extends object>(
  WrappedComponent: React.ComponentType<P>
): React.ComponentType<P> {
  const WithChatContextComponent = React.forwardRef<any, P>((props, ref) =>
    React.createElement(
      ChatProvider,
      null,
      React.createElement(WrappedComponent, { ...props, ref })
    )
  );

  WithChatContextComponent.displayName = `withChatContext(${WrappedComponent.displayName || WrappedComponent.name || 'Component'})`;

  return WithChatContextComponent as React.ComponentType<P>;
}

/**
 * Selector hook for accessing specific state slices
 * Prevents unnecessary re-renders when only specific state is needed
 */
export function useChatSelector<T>(
  selector: (state: ChatState) => T
): T {
  const { state } = useChatState();

  // Use React.useCallback to memoize the selector
  const memoizedSelector = React.useCallback(selector, []);

  // Re-compute only when the selected value changes
  return React.useMemo(() =>
    memoizedSelector(state),
    [state, memoizedSelector]
  );
}

// Export contexts for advanced usage
export { ChatStateContext, ChatActionsContext };