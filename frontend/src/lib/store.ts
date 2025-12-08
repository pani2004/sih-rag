// Global State Management with Zustand

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ChatMessage } from './types';

interface Conversation {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: number;
  updatedAt: number;
  isProcessing?: boolean;
  jobId?: string;
  streamingMessage?: string;
  streamingCitations?: any[];
  thinkingMessage?: string;
}

interface ChatStore {
  conversations: Conversation[];
  currentConversationId: string | null;
  isStreaming: boolean;
  
  // Conversation management
  createConversation: () => void;
  deleteConversation: (id: string) => void;
  setCurrentConversation: (id: string) => void;
  renameConversation: (id: string, title: string) => void;
  
  // Message management
  addMessage: (conversationId: string, message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
  clearMessages: () => void;
  
  // Job management
  setConversationProcessing: (id: string, isProcessing: boolean, jobId?: string) => void;
  
  // Streaming state per conversation
  setIsStreaming: (isStreaming: boolean) => void;
  setConversationStreaming: (id: string, streamingMessage: string | null, citations?: any[]) => void;
  setConversationThinking: (id: string, thinkingMessage: string | null) => void;
  
  // Getters
  getCurrentMessages: () => ChatMessage[];
  getCurrentConversation: () => Conversation | undefined;
  getConversation: (id: string) => Conversation | undefined;
}

const generateId = () => Math.random().toString(36).substring(7);

const generateTitle = (messages: ChatMessage[]): string => {
  const firstUserMessage = messages.find(m => m.role === 'user');
  if (!firstUserMessage) return 'New Chat';
  return firstUserMessage.content.slice(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '');
};

export const useChatStore = create<ChatStore>()(
  persist(
    (set, get) => ({
      conversations: [],
      currentConversationId: null,
      isStreaming: false,
      
      createConversation: () => {
        const id = generateId();
        const newConversation: Conversation = {
          id,
          title: 'New Chat',
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isProcessing: false,
        };
        set((state) => ({
          conversations: [newConversation, ...state.conversations],
          currentConversationId: id,
        }));
        console.log(`[Store] Created new conversation: ${id}`);
        return id; // Return ID for routing
      },
      
      deleteConversation: (id) => {
        set((state) => {
          const newConversations = state.conversations.filter(c => c.id !== id);
          const newCurrentId = state.currentConversationId === id 
            ? (newConversations[0]?.id || null)
            : state.currentConversationId;
          return {
            conversations: newConversations,
            currentConversationId: newCurrentId,
          };
        });
      },
      
      setCurrentConversation: (id) => {
        set({ currentConversationId: id });
      },
      
      renameConversation: (id, title) => {
        set((state) => ({
          conversations: state.conversations.map(conv =>
            conv.id === id ? { ...conv, title, updatedAt: Date.now() } : conv
          ),
        }));
      },
      
      addMessage: (conversationId, message) => {
        set((state) => {
          const updatedConversations = state.conversations.map(conv => {
            if (conv.id === conversationId) {
              const newMessages = [...conv.messages, message];
              return {
                ...conv,
                messages: newMessages,
                title: conv.messages.length === 0 && message.role === 'user' 
                  ? generateTitle(newMessages)
                  : conv.title,
                updatedAt: Date.now(),
              };
            }
            return conv;
          });
          
          return { conversations: updatedConversations };
        });
      },
      
      setMessages: (messages) => {
        set((state) => {
          const currentId = state.currentConversationId;
          if (!currentId) return state;
          
          const updatedConversations = state.conversations.map(conv =>
            conv.id === currentId
              ? { ...conv, messages, updatedAt: Date.now() }
              : conv
          );
          
          return { conversations: updatedConversations };
        });
      },
      
      clearMessages: () => {
        get().createConversation();
      },
      
      setConversationProcessing: (id, isProcessing, jobId) => {
        set((state) => ({
          conversations: state.conversations.map(conv =>
            conv.id === id 
              ? { ...conv, isProcessing, jobId, updatedAt: Date.now() }
              : conv
          ),
        }));
      },
      
      setIsStreaming: (isStreaming) => set({ isStreaming }),
      
      setConversationStreaming: (id, streamingMessage, citations) => {
        set((state) => ({
          conversations: state.conversations.map(conv =>
            conv.id === id
              ? { 
                  ...conv, 
                  streamingMessage: streamingMessage || undefined,
                  streamingCitations: citations || undefined,
                  updatedAt: Date.now() 
                }
              : conv
          ),
        }));
      },
      
      setConversationThinking: (id, thinkingMessage) => {
        set((state) => ({
          conversations: state.conversations.map(conv =>
            conv.id === id
              ? { ...conv, thinkingMessage: thinkingMessage || undefined }
              : conv
          ),
        }));
      },
      
      getCurrentMessages: () => {
        const state = get();
        const current = state.conversations.find(c => c.id === state.currentConversationId);
        return current?.messages || [];
      },
      
      getCurrentConversation: () => {
        const state = get();
        return state.conversations.find(c => c.id === state.currentConversationId);
      },
      
      getConversation: (id) => {
        const state = get();
        return state.conversations.find(c => c.id === id);
      },
    }),
    {
      name: 'chat-storage',
    }
  )
);

interface SettingsStore {
  useStreaming: boolean;
  setUseStreaming: (useStreaming: boolean) => void;
}

export const useSettingsStore = create<SettingsStore>()(
  persist(
    (set) => ({
      useStreaming: true, // Always use streaming by default
      setUseStreaming: (useStreaming) => set({ useStreaming }),
    }),
    {
      name: 'settings-storage',
    }
  )
);
