'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { MessageSquare, Plus, Edit2, Trash2, Check, GripVertical } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

interface Conversation {
  id: string;
  title: string;
  updatedAt: Date | number;
}

interface ChatSidebarProps {
  show: boolean;
  width: number;
  conversations: Conversation[];
  currentConversationId: string | null;
  onCreateConversation: () => void;
  onSelectConversation: (id: string) => void;
  onRenameConversation: (id: string, title: string) => void;
  onDeleteConversation: (id: string) => void;
  onClose: () => void;
  onWidthChange: (width: number) => void;
  isMobile: boolean;
}

export function ChatSidebar({
  show,
  width,
  conversations,
  currentConversationId,
  onCreateConversation,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
  onClose,
  onWidthChange,
  isMobile,
}: ChatSidebarProps) {
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [isResizing, setIsResizing] = useState(false);

  return (
    <>
      {/* Blur overlay */}
      <AnimatePresence>
        {show && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 bg-black/50 backdrop-blur-sm z-20"
            onClick={onClose}
          />
        )}
      </AnimatePresence>

      {/* Sidebar */}
      <AnimatePresence>
        {show && (
          <motion.div
            data-sidebar
            initial={{ x: -width, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: -width, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            style={{ width }}
            className="border-r bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 flex flex-col h-full fixed left-0 top-0 z-30 select-none shadow-lg"
          >
            <div className="p-3 border-b flex-shrink-0 flex items-center justify-between">
              <Button
                onClick={onCreateConversation}
                className="w-full justify-start"
                variant="outline"
              >
                <Plus className="h-4 w-4 mr-2" />
                New Chat
              </Button>
            </div>
            <ScrollArea className="flex-1 overflow-y-auto">
              <div className="p-2 space-y-1">
                {conversations.map((conv) => {
                  const isEditing = editingConversationId === conv.id;
                  const isActive = currentConversationId === conv.id;

                  return (
                    <div
                      key={conv.id}
                      className={`group flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-colors
                        ${isActive ? "bg-muted" : "hover:bg-muted/70"}`}
                      onClick={() => {
                        if (!isEditing) onSelectConversation(conv.id);
                      }}
                    >
                      <MessageSquare className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0">
                        {isEditing ? (
                          <input
                            className="w-full text-sm bg-background border border-border rounded px-2 py-1"
                            value={editingTitle}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setEditingTitle(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                onRenameConversation(conv.id, editingTitle);
                                setEditingConversationId(null);
                              }
                              if (e.key === "Escape") setEditingConversationId(null);
                            }}
                          />
                        ) : (
                          <>
                            <p className="text-sm truncate">{conv.title}</p>
                            <p className="text-xs text-muted-foreground truncate">
                              {formatDistanceToNow(new Date(conv.updatedAt), { addSuffix: true })}
                            </p>
                          </>
                        )}
                      </div>
                      {!isEditing ? (
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6"
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingConversationId(conv.id);
                              setEditingTitle(conv.title);
                            }}
                          >
                            <Edit2 className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 hover:bg-destructive/20 hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteConversation(conv.id);
                            }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6"
                          onClick={(e) => {
                            e.stopPropagation();
                            onRenameConversation(conv.id, editingTitle);
                            setEditingConversationId(null);
                          }}
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                      )}
                    </div>
                  );
                })}
                {conversations.length === 0 && (
                  <div className="text-center p-8 text-sm text-muted-foreground">
                    No conversations yet
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Resize Handle - Desktop only */}
            {!isMobile && (
              <div
                className="absolute right-0 top-0 bottom-0 w-1 hover:w-2 bg-transparent hover:bg-primary/50 cursor-col-resize transition-all group hidden md:block"
                onMouseDown={(e) => {
                  setIsResizing(true);
                  const startX = e.clientX;
                  const startWidth = width;

                  const handleMouseMove = (e: MouseEvent) => {
                    const newWidth = Math.min(Math.max(200, startWidth + (e.clientX - startX)), 500);
                    onWidthChange(newWidth);
                  };

                  const handleMouseUp = () => {
                    setIsResizing(false);
                    document.removeEventListener('mousemove', handleMouseMove);
                    document.removeEventListener('mouseup', handleMouseUp);
                  };

                  document.addEventListener('mousemove', handleMouseMove);
                  document.addEventListener('mouseup', handleMouseUp);
                }}
              >
                <div className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
