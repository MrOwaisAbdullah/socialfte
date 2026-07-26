import { useState, useEffect, useCallback } from 'react';
import type { ChatSession, ChatMessage, UseSessionPersistenceReturn } from '../types';

const STORAGE_KEY = 'chatwidget-sessions';
const MAX_MESSAGES_PER_SESSION = 50;
const MAX_SESSIONS = 10;

/**
 * Hook for persisting chat sessions in LocalStorage
 * Provides methods to create, save, load, and delete chat sessions
 */
export function useSessionPersistence(): UseSessionPersistenceReturn {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSession, setCurrentSession] = useState<ChatSession | null>(null);

  // Load sessions from LocalStorage on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsedSessions = JSON.parse(stored);
        setSessions(parsedSessions);
      }
    } catch (error) {
      console.error('Error loading sessions from LocalStorage:', error);
    }
  }, []);

  // Save sessions to LocalStorage whenever they change
  useEffect(() => {
    try {
      if (sessions.length > 0) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(sessions));
      }
    } catch (error) {
      console.error('Error saving sessions to LocalStorage:', error);
    }
  }, [sessions]);

  const createSession = useCallback(() => {
    const newSession: ChatSession = {
      id: `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      messages: []
    };

    setSessions(prev => {
      const updated = [newSession, ...prev];
      // Keep only the most recent sessions
      return updated.slice(0, MAX_SESSIONS);
    });

    setCurrentSession(newSession);
    return newSession;
  }, []);

  const saveMessage = useCallback((sessionId: string, message: ChatMessage) => {
    setSessions(prev => prev.map(session => {
      if (session.id === sessionId) {
        const updatedMessages = [...session.messages, message];
        // Keep only the last N messages per session
        const trimmedMessages = updatedMessages.slice(-MAX_MESSAGES_PER_SESSION);

        const updatedSession = {
          ...session,
          messages: trimmedMessages,
          updatedAt: new Date().toISOString()
        };

        // Update current session if it matches
        if (currentSession?.id === sessionId) {
          setCurrentSession(updatedSession);
        }

        return updatedSession;
      }
      return session;
    }));
  }, [currentSession]);

  const deleteSession = useCallback((sessionId: string) => {
    setSessions(prev => prev.filter(session => session.id !== sessionId));

    // Clear current session if it was deleted
    if (currentSession?.id === sessionId) {
      setCurrentSession(null);
    }
  }, [currentSession]);

  const loadSession = useCallback((sessionId: string) => {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      setCurrentSession(session);
    }
  }, [sessions]);

  const clearAllSessions = useCallback(() => {
    setSessions([]);
    setCurrentSession(null);
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      console.error('Error clearing sessions from LocalStorage:', error);
    }
  }, []);

  return {
    sessions,
    currentSession,
    createSession,
    saveMessage,
    deleteSession,
    loadSession,
    clearAllSessions
  };
}