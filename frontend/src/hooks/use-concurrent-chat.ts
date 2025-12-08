'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useChatStore } from '@/lib/store';
import { sendInngestEvent } from '@/lib/inngest/client';
import { toast } from 'sonner';
import { getRandomThinkingMessage } from '@/components/chat/thinking-messages';
import type { Citation } from '@/lib/types';

export function useConcurrentChat(conversationId: string) {
  const [input, setInput] = useState('');
  const thinkingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const currentSessionIdRef = useRef<string | null>(null);

  const { 
    addMessage,
    getConversation,
    setConversationProcessing,
    setConversationStreaming,
    setConversationThinking,
  } = useChatStore();
  
  const conversation = getConversation(conversationId);
  const messages = conversation?.messages || [];
  const isProcessing = conversation?.isProcessing || false;
  const sessionId = conversation?.jobId;
  const currentStreamingMessage = conversation?.streamingMessage || null;
  const thinkingMessage = conversation?.thinkingMessage || '';
  const currentCitations = conversation?.streamingCitations || [];

  // Poll for Inngest job results
  const pollJobStatus = useCallback(async (sessionId: string) => {
    try {
      const response = await fetch(`/api/chat/session/${sessionId}`);
      const data = await response.json();

      if (data.status === 'completed') {
        // Stop polling
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        if (thinkingIntervalRef.current) {
          clearInterval(thinkingIntervalRef.current);
          thinkingIntervalRef.current = null;
        }

        // Add response to conversation
        setConversationProcessing(conversationId, false);
        
        if (data.response && data.conversationId === conversationId) {
          addMessage(conversationId, {
            role: 'assistant',
            content: data.response,
            citations: data.citations,
          });
          toast.success('Response received');
        }
        
        setConversationStreaming(conversationId, null, []);
        setConversationThinking(conversationId, null);
        currentSessionIdRef.current = null;
      } else if (data.status === 'failed') {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        if (thinkingIntervalRef.current) {
          clearInterval(thinkingIntervalRef.current);
          thinkingIntervalRef.current = null;
        }
        
        setConversationProcessing(conversationId, false);
        toast.error(`Error: ${data.error || 'Unknown error'}`);
        currentSessionIdRef.current = null;
      }
    } catch (error) {
      console.error('Polling error:', error);
    }
  }, [conversationId, addMessage, setConversationProcessing]);

  // Start polling when session starts
  useEffect(() => {
    if (sessionId && isProcessing) {
      currentSessionIdRef.current = sessionId;
      
      // Poll immediately
      pollJobStatus(sessionId);
      
      // Then poll every 2 seconds
      pollingIntervalRef.current = setInterval(() => {
        pollJobStatus(sessionId);
      }, 2000);
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [sessionId, isProcessing, pollJobStatus]);

  // Clean up on unmount or conversation change
  useEffect(() => {
    return () => {
      if (thinkingIntervalRef.current) {
        clearInterval(thinkingIntervalRef.current);
      }
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, [conversationId]);

  const handleStop = () => {
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    
    if (thinkingIntervalRef.current) {
      clearInterval(thinkingIntervalRef.current);
      thinkingIntervalRef.current = null;
    }
    
    setConversationStreaming(conversationId, null, []);
    setConversationThinking(conversationId, null);
    setConversationProcessing(conversationId, false);
    currentSessionIdRef.current = null;
    toast.info('Processing stopped');
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    
    // Don't allow new requests while processing - wait for current one to complete
    if (isProcessing) {
      console.log('[Concurrent Chat] Already processing in this conversation, please wait');
      toast.info('Please wait for the current response to complete');
      return;
    }

    const userMessage = { role: 'user' as const, content: input.trim(), timestamp: Date.now() };
    const messageContent = userMessage.content;
    addMessage(conversationId, userMessage);
    setInput('');

    // Generate unique session ID for this chat
    const newSessionId = `session_${conversationId}_${Date.now()}`;
    
    // Set processing state with session ID
    setConversationProcessing(conversationId, true, newSessionId);
    setConversationStreaming(conversationId, '', []);
    
    // Start thinking animation with random message
    setConversationThinking(conversationId, getRandomThinkingMessage());
    thinkingIntervalRef.current = setInterval(() => {
      setConversationThinking(conversationId, getRandomThinkingMessage());
    }, 2000);

    try {
      // Send Inngest event for background analytics/logging
      sendInngestEvent('chat/message.sent', {
        sessionId: newSessionId,
        conversationId,
        message: messageContent,
        conversationHistory: messages,
      }).catch(err => console.error('Inngest event error:', err));

      // Stream response from backend
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
      const response = await fetch(`${API_URL}/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: messageContent,
          conversation_history: messages.map(m => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let fullResponse = '';
      let receivedCitations: Citation[] = [];
      let thinkingTime: number | undefined;
      let responseTime: number | undefined;
      let totalTime: number | undefined;
      let buffer = '';

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          
          // Keep the last incomplete line in buffer
          buffer = lines.pop() || '';

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const data = line.slice(6).trim();
              
              if (!data) continue;

              try {
                const parsed = JSON.parse(data);
                
                // Handle different message types from backend
                if (parsed.status === 'citations' && parsed.citations) {
                  receivedCitations = parsed.citations;
                  thinkingTime = parsed.thinkingTime;
                  setConversationStreaming(conversationId, fullResponse, receivedCitations);
                  console.log('[Stream] Received citations:', receivedCitations.length, 'Thinking time:', thinkingTime, 's');
                } else if (parsed.chunk) {
                  // Streaming content chunks
                  fullResponse += parsed.chunk;
                  setConversationStreaming(conversationId, fullResponse, receivedCitations);
                } else if (parsed.status === 'done') {
                  responseTime = parsed.responseTime;
                  totalTime = parsed.totalTime;
                  console.log('[Stream] Streaming complete - Response time:', responseTime, 's, Total:', totalTime, 's');
                }
              } catch (e) {
                // Skip invalid JSON
                console.warn('[Stream] Invalid JSON:', data);
              }
            }
          }
        }
      }

      // Stop thinking animation
      if (thinkingIntervalRef.current) {
        clearInterval(thinkingIntervalRef.current);
        thinkingIntervalRef.current = null;
      }
      setConversationThinking(conversationId, null);

      // Add assistant message with timing data
      if (fullResponse) {
        addMessage(conversationId, {
          role: 'assistant',
          content: fullResponse,
          citations: receivedCitations.length > 0 ? receivedCitations : undefined,
          timestamp: Date.now(),
          thinkingTime,
          responseTime,
          totalTime,
        });
      }

      setConversationStreaming(conversationId, null, []);
      setConversationProcessing(conversationId, false);
      console.log(`[Chat] Completed streaming for session ${newSessionId}`);
    } catch (error: any) {
      if (thinkingIntervalRef.current) {
        clearInterval(thinkingIntervalRef.current);
        thinkingIntervalRef.current = null;
      }
      setConversationThinking(conversationId, null);
      toast.error(`Failed to send message: ${error.message}`);
      addMessage(conversationId, {
        role: 'assistant',
        content: 'Sorry, I encountered an error. Please try again.',
      });
      setConversationProcessing(conversationId, false);
      setConversationStreaming(conversationId, null, []);
    }
  };

  return {
    input,
    setInput,
    currentStreamingMessage,
    thinkingMessage,
    currentCitations,
    isStreaming: isProcessing,
    messages,
    handleSend,
    handleStop,
  };
}
