'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore, useSettingsStore } from '@/lib/store';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import type { Citation } from '@/lib/types';

export function useInngestChat(conversationId: string) {
  const [input, setInput] = useState('');
  const [isPolling, setIsPolling] = useState(false);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const { 
    addMessage,
    setConversationProcessing,
    getConversation,
  } = useChatStore();
  
  const conversation = getConversation(conversationId);
  const messages = conversation?.messages || [];
  const isProcessing = conversation?.isProcessing || false;
  const jobId = conversation?.jobId;

  const { useStreaming } = useSettingsStore();

  // Poll for job completion
  const pollJobStatus = useCallback(async (jobId: string) => {
    try {
      const status = await api.getChatJobStatus(jobId);
      
      if (status.status === 'completed') {
        setIsPolling(false);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        
        setConversationProcessing(conversationId, false);
        
        if (status.response) {
          addMessage(conversationId, { 
            role: 'assistant', 
            content: status.response, 
            citations: status.citations 
          });
          toast.success('Response received');
        }
      } else if (status.status === 'failed') {
        setIsPolling(false);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        
        setConversationProcessing(conversationId, false);
        toast.error(`Error: ${status.error || 'Unknown error'}`);
      }
    } catch (error: any) {
      console.error('Polling error:', error);
    }
  }, [conversationId, addMessage, setConversationProcessing]);

  // Start polling when jobId changes
  useEffect(() => {
    if (jobId && isProcessing) {
      setIsPolling(true);
      
      // Poll immediately
      pollJobStatus(jobId);
      
      // Then poll every 2 seconds
      pollingIntervalRef.current = setInterval(() => {
        pollJobStatus(jobId);
      }, 2000);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [jobId, isProcessing, pollJobStatus]);

  const handleSend = async () => {
    if (!input.trim() || isProcessing) return;

    const userMessage = { role: 'user' as const, content: input.trim() };
    addMessage(conversationId, userMessage);
    setInput('');

    try {
      setConversationProcessing(conversationId, true);
      
      const result = await api.sendChatJob(
        {
          message: userMessage.content,
          conversation_history: messages,
        },
        conversationId
      );

      setConversationProcessing(conversationId, true, result.jobId);
      toast.info('Processing your message...');
    } catch (error: any) {
      toast.error(`Failed to send message: ${error.message}`);
      setConversationProcessing(conversationId, false);
    }
  };

  const handleStop = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
    setConversationProcessing(conversationId, false);
    toast.info('Processing stopped');
  };

  return {
    input,
    setInput,
    isProcessing: isProcessing || isPolling,
    messages,
    handleSend,
    handleStop,
  };
}
