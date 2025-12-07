'use client';

import { Sparkles } from 'lucide-react';

export function EmptyState() {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[60vh] text-center">
      <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-4 rounded-2xl mb-4">
        <Sparkles className="h-12 w-12 text-white" />
      </div>
      <h2 className="text-2xl font-semibold mb-2">
        How can I help you today?
      </h2>
      <p className="text-muted-foreground max-w-md">
        Upload documents and ask questions. I'll help you find answers
        from your knowledge base.
      </p>
    </div>
  );
}
