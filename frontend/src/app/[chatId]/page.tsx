'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ChatInterface } from '@/components/chat-interface';
import { useChatStore } from '@/lib/store';

export default function ChatPage() {
  const params = useParams();
  const router = useRouter();
  const chatId = params.chatId as string;
  const [isHydrated, setIsHydrated] = useState(false);
  
  const { 
    conversations,
    currentConversationId,
    setCurrentConversation,
    createConversation,
  } = useChatStore();

  // Wait for hydration to complete
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    // Don't run until store is hydrated from localStorage
    if (!isHydrated) return;

    // Check if the chatId from URL exists
    const conversationExists = conversations.find(c => c.id === chatId);
    
    if (conversationExists) {
      // Set this conversation as current if it's not already
      if (currentConversationId !== chatId) {
        setCurrentConversation(chatId);
      }
    } else if (conversations.length > 0) {
      // Only redirect to first conversation if URL chatId doesn't exist
      router.replace(`/${conversations[0].id}`);
    }
    // Don't create new conversation here - only redirect if needed
  }, [isHydrated, chatId, conversations, currentConversationId, setCurrentConversation, router]);

  return (
    <div className="h-screen flex flex-col">
      <ChatInterface />
    </div>
  );
}
