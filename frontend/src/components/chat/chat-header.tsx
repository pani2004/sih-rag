'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { Sparkles, BarChart3, FileText, PanelLeft, PanelLeftClose } from 'lucide-react';
import Link from 'next/link';

interface ChatHeaderProps {
  showSidebar: boolean;
  onToggleSidebar: () => void;
  documentCount: number;
  showDocuments: boolean;
  onToggleDocuments: () => void;
  onNewChat: () => void;
  hasMessages: boolean;
}

export function ChatHeader({
  showSidebar,
  onToggleSidebar,
  documentCount,
  showDocuments,
  onToggleDocuments,
  onNewChat,
  hasMessages,
}: ChatHeaderProps) {
  const router = useRouter();
  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0">
      <div className="container max-w-4xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {/* Sidebar Toggle Button */}
            <Button
              data-sidebar-toggle
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={onToggleSidebar}
            >
              {showSidebar ? (
                <PanelLeftClose className="h-4 w-4" />
              ) : (
                <PanelLeft className="h-4 w-4" />
              )}
            </Button>

            {/* Logo */}
            <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-2 rounded-lg">
              <Sparkles className="h-5 w-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-semibold">RAG Assistant</h1>
              <p className="text-xs text-muted-foreground">
                Powered by HASH-IT-OUT
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link href="/metrics">
              <Button variant="outline" size="sm">
                <BarChart3 className="h-4 w-4 mr-2" />
                Metrics
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={onToggleDocuments}
            >
              <FileText className="h-4 w-4 mr-2" />
              {documentCount} Docs
            </Button>
            <ThemeToggle />
            <Button
              variant="ghost"
              size="sm"
              onClick={onNewChat}
              disabled={!hasMessages}
            >
              New Chat
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
