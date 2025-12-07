'use client';

import { useState, useRef } from 'react';
import { useChatStore, useSettingsStore } from '@/lib/store';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { getRandomThinkingMessage } from '@/components/chat/thinking-messages';
import type { Citation } from '@/lib/types';

export function useChatLogic() {
  const [input, setInput] = useState('');
  const [currentStreamingMessage, setCurrentStreamingMessage] = useState<string | null>(null);
  const [thinkingMessage, setThinkingMessage] = useState('');
  const [currentCitations, setCurrentCitations] = useState<Citation[]>([]);
  const abortControllerRef = useRef<AbortController | null>(null);

  const { 
    addMessage,
    setIsStreaming,
    isStreaming,
    getCurrentMessages,
    getCurrentConversation,
  } = useChatStore();
  
  const messages = getCurrentMessages();
  const currentConversation = getCurrentConversation();
  const conversationId = currentConversation?.id;
  const { useStreaming } = useSettingsStore();

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    if (currentStreamingMessage && conversationId) {
      addMessage(conversationId, { 
        role: 'assistant', 
        content: currentStreamingMessage + '\n\n*[Response stopped by user]*', 
        citations: currentCitations,
        timestamp: Date.now()
      });
    }
    
    setCurrentStreamingMessage(null);
    setCurrentCitations([]);
    setIsStreaming(false);
    toast.info('Response stopped');
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming || !conversationId) return;

    const userMessage = { role: 'user' as const, content: input.trim(), timestamp: Date.now() };
    addMessage(conversationId, userMessage);
    setInput('');

    if (useStreaming) {
      setIsStreaming(true);
      setCurrentStreamingMessage(null);
      setCurrentCitations([]);
      
      setThinkingMessage(getRandomThinkingMessage());
      
      const thinkingInterval = setInterval(() => {
        setThinkingMessage(getRandomThinkingMessage());
      }, 2000);
      
      abortControllerRef.current = new AbortController();

      try {
        await api.chatStream(
          {
            message: userMessage.content,
            conversation_history: messages,
          },
          (chunk) => {
            setCurrentStreamingMessage((prev) => (prev === null ? chunk : prev + chunk));
          },
          (fullResponse, citations) => {
            clearInterval(thinkingInterval);
            if (conversationId) {
              addMessage(conversationId, { 
                role: 'assistant', 
                content: fullResponse, 
                citations,
                timestamp: Date.now()
              });
            }
            setCurrentStreamingMessage(null);
            setCurrentCitations([]);
            setIsStreaming(false);
            abortControllerRef.current = null;
          },
          (error) => {
            clearInterval(thinkingInterval);
            if (error.name !== 'AbortError') {
              toast.error(`Error: ${error.message}`);
            }
            setCurrentStreamingMessage(null);
            setCurrentCitations([]);
            setIsStreaming(false);
            abortControllerRef.current = null;
          },
          (citations) => {
            setCurrentCitations(citations);
          },
          abortControllerRef.current.signal
        );
      } catch (error: any) {
        clearInterval(thinkingInterval);
        if (error.name !== 'AbortError') {
          toast.error(`Failed to send message: ${error.message}`);
        }
        setIsStreaming(false);
        abortControllerRef.current = null;
      }
    } else {
      setIsStreaming(true);
      try {
        const response = await api.chat({
          message: userMessage.content,
          conversation_history: messages,
        });
        if (conversationId) {
          addMessage(conversationId, { 
            role: 'assistant', 
            content: response.response, 
            citations: response.citations,
            timestamp: Date.now()
          });
        }
      } catch (error: any) {
        toast.error(`Failed to send message: ${error.message}`);
      } finally {
        setIsStreaming(false);
      }
    }
  };

  return {
    input,
    setInput,
    currentStreamingMessage,
    thinkingMessage,
    currentCitations,
    isStreaming,
    messages,
    handleSend,
    handleStop,
  };
}
