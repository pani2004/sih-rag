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
  } = useChatStore();
  
  const messages = getCurrentMessages();
  const { useStreaming } = useSettingsStore();

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    
    if (currentStreamingMessage) {
      addMessage({ 
        role: 'assistant', 
        content: currentStreamingMessage + '\n\n*[Response stopped by user]*', 
        citations: currentCitations 
      });
    }
    
    setCurrentStreamingMessage(null);
    setCurrentCitations([]);
    setIsStreaming(false);
    toast.info('Response stopped');
  };

  const handleSend = async () => {
    if (!input.trim() || isStreaming) return;

    const userMessage = { role: 'user' as const, content: input.trim() };
    addMessage(userMessage);
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
            addMessage({ role: 'assistant', content: fullResponse, citations });
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
        addMessage({ role: 'assistant', content: response.response, citations: response.citations });
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
