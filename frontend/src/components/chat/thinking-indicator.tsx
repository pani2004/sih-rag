'use client';

import { motion } from 'framer-motion';
import { Sparkles } from 'lucide-react';

interface ThinkingIndicatorProps {
  message: string;
}

export function ThinkingIndicator({ message }: ThinkingIndicatorProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="flex gap-4 justify-start"
    >
      <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-2 rounded-lg h-8 w-8 flex-shrink-0">
        <Sparkles className="h-4 w-4 text-white" />
      </div>
      <div className="flex-1 max-w-[85%]">
        <div className="rounded-xl px-4 py-3 bg-card border border-border">
          <div className="flex items-center gap-2">
            <motion.div 
              className="w-2 h-2 rounded-full bg-purple-500"
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.5, 1, 0.5]
              }}
              transition={{ 
                duration: 0.8, 
                repeat: Infinity, 
                ease: "easeInOut" 
              }}
            />
            <motion.div 
              className="w-2 h-2 rounded-full bg-purple-500"
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.5, 1, 0.5]
              }}
              transition={{ 
                duration: 0.8, 
                repeat: Infinity, 
                ease: "easeInOut",
                delay: 0.2
              }}
            />
            <motion.div 
              className="w-2 h-2 rounded-full bg-purple-500"
              animate={{ 
                scale: [1, 1.2, 1],
                opacity: [0.5, 1, 0.5]
              }}
              transition={{ 
                duration: 0.8, 
                repeat: Infinity, 
                ease: "easeInOut",
                delay: 0.4
              }}
            />
            <span className="text-sm text-muted-foreground ml-1">{message}</span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
