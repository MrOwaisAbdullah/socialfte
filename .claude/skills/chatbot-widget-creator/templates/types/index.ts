/**
 * Type definitions for the ChatWidget component system
 * Based on the specification and implementation plan for 003-chat-ui feature
 */

// Core message interface representing a single chat message
export interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  timestamp: Date;
  sources?: SourceCitation[];
  isStreaming?: boolean;
}

// Source citation interface for referencing content (updated to match spec)
export interface SourceCitation {
  chapter: string;
  section: string;
  direct_link: string;
  page_number?: number;
}

// Legacy citation interface for backward compatibility
export interface Citation {
  text: string;
  source: string;
  url?: string;
  page?: number;
  chapter?: string;
}

// Chat session state management (updated to match spec)
export interface ChatSession {
  messages: ChatMessage[];
  isOpen: boolean;
  isThinking: boolean;
  currentStreamingId?: string;
}

// Legacy session interface for backward compatibility
export interface ChatSessionLegacy {
  id: string;
  createdAt: string;
  updatedAt: string;
  messages: ChatMessage[];
}

// Text selection state for "Ask AI" functionality (updated to match spec)
export interface TextSelectionState {
  selectedText: string;
  rect: DOMRect;
  isVisible: boolean;
}

// Legacy text selection for backward compatibility
export interface TextSelection {
  text: string;
  range: Range;
  rect: DOMRect;
}

export interface ChatWidgetProps {
  apiSessionEndpoint?: string;
  theme?: 'light' | 'dark';
  title?: string;
  onOpen?: () => void;
  onClose?: () => void;
  onMessage?: (message: ChatMessage) => void;
}

export interface ChatButtonProps {
  onClick: () => void;
  hasSelection?: boolean;
  icon?: string;
  position?: 'bottom-right' | 'bottom-left';
}

export interface SelectionPopoverProps {
  selection: TextSelection;
  onAskAboutSelection: (text: string) => void;
  onClose: () => void;
}

export interface UseSessionPersistenceReturn {
  sessions: ChatSession[];
  currentSession: ChatSession | null;
  createSession: () => ChatSession;
  saveMessage: (sessionId: string, message: ChatMessage) => void;
  deleteSession: (sessionId: string) => void;
  loadSession: (sessionId: string) => void;
  clearAllSessions: () => void;
}

export interface UseChatKitSessionReturn {
  clientSecret: string | null;
  isLoading: boolean;
  error: Error | null;
  refreshSession: () => Promise<void>;
}

export interface UseTextSelectionReturn {
  selectedText: string;
  selection: TextSelection | null;
  isSelecting: boolean;
  clearSelection: () => void;
}

// Chat API request interface
export interface ChatRequest {
  question: string; // Changed to match backend API
  context?: {
    selectedText: string;
    source: string; // Chapter/section info
  };
  stream: boolean;
}

// Chat API response interface
export interface ChatResponse {
  message: string;
  sources?: SourceCitation[];
  isComplete: boolean;
  error?: {
    code: string;
    message: string;
    retryable: boolean;
  };
}

// Animation configuration types
export interface AnimationVariants {
  initial: Record<string, any>;
  animate: Record<string, any>;
  exit?: Record<string, any>;
  transition?: Record<string, any>;
}

// Component props interfaces for new ChatGPT-style components
export interface MessageBubbleProps {
  message: ChatMessage;
  isStreaming?: boolean;
}

export interface SourceBadgeProps {
  citation: SourceCitation;
  onClick?: (citation: SourceCitation) => void;
}

export interface SelectionTooltipProps {
  selectedText: string;
  position: { x: number; y: number };
  onAskAI: (text: string) => void;
  onClose: () => void;
}

export interface InputAreaProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export interface WelcomeScreenProps {
  suggestions: string[];
  onSuggestionClick: (suggestion: string) => void;
}

export interface ThinkingIndicatorProps {
  isVisible: boolean;
}

export interface StreamingCursorProps {
  isVisible: boolean;
}

// ChatWidget container props
export interface ChatWidgetContainerProps {
  apiUrl?: string;
  maxTextSelectionLength?: number;
  fallbackTextLength?: number;
}

// ============================================================================
// CONSOLIDATED STATE MANAGEMENT FOR RE-RENDER FIX
// ============================================================================

/**
 * Consolidated Chat State Interface
 * Combines all chat widget state to prevent context fragmentation
 */
export interface ChatState {
  // Message state
  messages: ChatMessage[];

  // UI state
  isOpen: boolean;
  isThinking: boolean;

  // Streaming state
  currentStreamingId?: string;
  streamingError?: Error;

  // Session state
  sessionId: string;
  sessionCreatedAt: Date;

  // Error handling
  error: Error | null;
  lastErrorTime?: number;

  // Performance tracking
  renderCount: number;
}

/**
 * Chat Actions Interface
 * All possible actions that can modify the chat state
 */
export type ChatAction =
  | { type: 'ADD_MESSAGE'; payload: ChatMessage }
  | { type: 'UPDATE_MESSAGE'; payload: { id: string; content: string; sources?: SourceCitation[] } }
  | { type: 'DELETE_MESSAGE'; payload: string }
  | { type: 'CLEAR_MESSAGES' }
  | { type: 'SET_IS_OPEN'; payload: boolean }
  | { type: 'SET_IS_THINKING'; payload: boolean }
  | { type: 'START_STREAMING'; payload: string }
  | { type: 'UPDATE_STREAMING'; payload: string }
  | { type: 'COMPLETE_STREAMING' }
  | { type: 'SET_STREAMING_ERROR'; payload: Error }
  | { type: 'CLEAR_ERROR' }
  | { type: 'SET_SESSION_ID'; payload: string }
  | { type: 'RESET_STATE' }
  | { type: 'INCREMENT_RENDER_COUNT' };

/**
 * Context interfaces for split context pattern
 */
export interface ChatStateContextType {
  state: ChatState;
}

export interface ChatActionsContextType {
  // Message actions
  addMessage: (message: Omit<ChatMessage, 'id' | 'timestamp'>) => string;
  updateMessage: (id: string, content: string, sources?: SourceCitation[]) => void;
  deleteMessage: (id: string) => void;
  clearMessages: () => void;

  // UI actions
  setIsOpen: (open: boolean) => void;
  setIsThinking: (thinking: boolean) => void;

  // Streaming actions
  startStreaming: (messageId: string) => void;
  updateStreaming: (content: string) => void;
  completeStreaming: () => void;
  setStreamingError: (error: Error) => void;

  // Error handling
  clearError: () => void;

  // Session management
  resetChat: () => void;

  // Utility
  incrementRenderCount: () => void;
}

/**
 * Initial chat state
 */
export const initialChatState: ChatState = {
  messages: [],
  isOpen: false,
  isThinking: false,
  sessionId: '',
  sessionCreatedAt: new Date(),
  error: null,
  renderCount: 0
};

/**
 * Chat widget configuration options
 */
export interface ChatWidgetConfig {
  apiUrl?: string;
  maxTextSelectionLength?: number;
  fallbackTextLength?: number;
  enablePerformanceMonitoring?: boolean;
  enableErrorReporting?: boolean;
  maxMessages?: number;
  messageRetentionHours?: number;
}