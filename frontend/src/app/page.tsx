'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useChatStore } from '@/lib/store';

export default function HomePage() {
  const router = useRouter();
  const [isHydrated, setIsHydrated] = useState(false);
  const { conversations, createConversation } = useChatStore();

  // Wait for hydration to complete
  useEffect(() => {
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    // Don't run until store is hydrated from localStorage
    if (!isHydrated) return;

    // Only redirect/create once after hydration
    if (conversations.length > 0) {
      router.replace(`/${conversations[0].id}`);
    } else {
      const newId = createConversation();
      router.replace(`/${newId}`);
    }
  }, [isHydrated]); // Only depend on isHydrated to run once

  return (
    <div className="h-screen flex items-center justify-center">
      <div className="text-muted-foreground">Loading...</div>
    </div>
  );
}
