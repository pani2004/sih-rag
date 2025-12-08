'use client';

import { useState, useRef, useEffect } from 'react';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useChatStore } from '@/lib/store';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useConcurrentChat } from '@/hooks/use-concurrent-chat';
import { useFileUpload } from '@/hooks/use-file-upload';
import { ChatHeader } from '@/components/chat/chat-header';
import { ChatSidebar } from '@/components/chat/chat-sidebar';
import { DocumentsSidebar } from '@/components/chat/documents-sidebar';
import { DocumentDialogs } from '@/components/chat/document-dialogs';
import { ChatInput } from '@/components/chat/chat-input';
import { EmptyState } from '@/components/chat/empty-state';
import { MessageItem } from '@/components/chat/message-item';
import { ThinkingIndicator } from '@/components/chat/thinking-indicator';
import { ProcessingJobs } from '@/components/chat/processing-jobs';

export function ChatInterface() {
  const [showDocuments, setShowDocuments] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(256);
  const [isMobile, setIsMobile] = useState(false);
  const [viewingDocument, setViewingDocument] = useState<any>(null);
  const [editingDocument, setEditingDocument] = useState<any>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { 
    conversations,
    currentConversationId,
    createConversation,
    deleteConversation,
    setCurrentConversation,
    renameConversation,
  } = useChatStore();

  const {
    input,
    setInput,
    currentStreamingMessage,
    thinkingMessage,
    currentCitations,
    isStreaming,
    messages,
    handleSend,
    handleStop,
  } = useConcurrentChat(currentConversationId || 'default');

  const { data: documentsData, refetch } = useQuery({
    queryKey: ['documents'],
    queryFn: () => api.getDocuments(10),
    enabled: showDocuments,
  });
  
  const { data: documentCount } = useQuery({
    queryKey: ['documents-count'],
    queryFn: () => api.getDocuments(1),
  });

  const {
    uploading,
    uploadProgress,
    uploadingFileName,
    isDraggingOver,
    processingJobs,
    handleFileUpload,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  } = useFileUpload(currentConversationId || 'default', refetch);

  // Mobile detection
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Auto-close sidebar on mobile when clicking outside
  useEffect(() => {
    if (!isMobile || !showSidebar) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('[data-sidebar]') && !target.closest('[data-sidebar-toggle]')) {
        setShowSidebar(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isMobile, showSidebar]);

  useEffect(() => {
    // Only scroll when message completes (not during streaming)
    // This allows user to see content stream without page jumping
    if (!currentStreamingMessage && messages.length > 0) {
      // Small delay to ensure DOM updates before scroll
      const timer = setTimeout(() => {
        scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
      return () => clearTimeout(timer);
    }
  }, [messages.length]);

  return (
    <div className="flex h-screen overflow-hidden relative">
      {/* Chat Sidebar */}
      <ChatSidebar
        show={showSidebar}
        width={sidebarWidth}
        conversations={conversations}
        currentConversationId={currentConversationId}
        onCreateConversation={createConversation}
        onSelectConversation={setCurrentConversation}
        onRenameConversation={renameConversation}
        onDeleteConversation={deleteConversation}
        onClose={() => setShowSidebar(false)}
        onWidthChange={setSidebarWidth}
        isMobile={isMobile}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        {/* Header */}
        <ChatHeader
          showSidebar={showSidebar}
          onToggleSidebar={() => setShowSidebar(prev => !prev)}
          documentCount={documentCount?.total || 0}
          showDocuments={showDocuments}
          onToggleDocuments={() => setShowDocuments(!showDocuments)}
          onNewChat={createConversation}
          hasMessages={messages.length > 0}
        />

        {/* Messages */}
        <ScrollArea className="flex-1 overflow-y-auto">
          <div className="container max-w-4xl mx-auto px-4 py-6">
            {messages.length === 0 ? (
              <EmptyState />
            ) : (
              <div className="space-y-6">
                {messages.map((message, index) => (
                  <MessageItem key={index} message={message} />
                ))}

                {/* Thinking Animation */}
                {isStreaming && !currentStreamingMessage && (
                  <ThinkingIndicator message={thinkingMessage} />
                )}

                {/* Streaming Message */}
                {currentStreamingMessage && (
                  <MessageItem 
                    message={{
                      role: 'assistant',
                      content: currentStreamingMessage,
                      citations: currentCitations,
                    }}
                  />
                )}

                <div ref={scrollRef} />
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Processing Jobs Display */}
        {processingJobs.size > 0 && (
          <div className="border-t bg-background px-4 py-3">
            <div className="container max-w-4xl mx-auto">
              <ProcessingJobs jobs={processingJobs} />
            </div>
          </div>
        )}

        {/* Input Area */}
        <ChatInput
          input={input}
          onInputChange={setInput}
          onSend={handleSend}
          onFileUpload={handleFileUpload}
          onStop={handleStop}
          isStreaming={isStreaming}
          uploading={uploading}
          uploadProgress={uploadProgress}
          uploadingFileName={uploadingFileName}
        />
      </div>

      {/* Documents Sidebar */}
      <DocumentsSidebar
        show={showDocuments}
        documents={documentsData?.documents || []}
        onClose={() => setShowDocuments(false)}
        onRefetch={refetch}
        uploading={uploading}
        uploadProgress={uploadProgress}
        uploadingFileName={uploadingFileName}
        onFileSelect={() => fileInputRef.current?.click()}
        isDraggingOver={isDraggingOver}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onViewDocument={setViewingDocument}
        onEditDocument={setEditingDocument}
      />

      {/* Document Dialogs */}
      <DocumentDialogs
        viewingDocument={viewingDocument}
        editingDocument={editingDocument}
        onCloseView={() => setViewingDocument(null)}
        onCloseEdit={() => setEditingDocument(null)}
        onRefetch={refetch}
      />

      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={handleFileUpload}
        accept=".pdf,.docx,.pptx,.xlsx,.md,.txt,.mp3,.wav,.m4a,.flac"
      />
    </div>
  );
}
