'use client';

import { useState } from 'react';
import { Sparkles, User, BookOpen, Clock, Zap, ChevronDown } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { CitationViewer } from './citation-viewer';
import type { Citation } from '@/lib/types';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  timestamp?: number;
  thinkingTime?: number;
  responseTime?: number;
  totalTime?: number;
}

interface MessageItemProps {
  message: Message;
}

export function MessageItem({ message }: MessageItemProps) {
  const [selectedCitation, setSelectedCitation] = useState<Citation | null>(null);
  const [citationViewerOpen, setCitationViewerOpen] = useState(false);

  const handleCitationClick = (citation: Citation) => {
    setSelectedCitation(citation);
    setCitationViewerOpen(true);
  };

  return (
    <div>
      <div
        className={`flex gap-4 ${
          message.role === 'user' ? 'justify-end' : 'justify-start'
        }`}
      >
        {message.role === 'assistant' && (
          <div className="bg-gradient-to-br from-purple-500 to-pink-500 p-2 rounded-lg h-8 w-8 flex-shrink-0">
            <Sparkles className="h-4 w-4 text-white" />
          </div>
        )}
        <div className={message.role === 'user' ? 'max-w-[85%]' : 'flex-1 max-w-[85%]'}>
          <div
            className={`rounded-xl px-4 py-3 border ${
              message.role === 'user'
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border'
            }`}
          >
            <div className="prose prose-base dark:prose-invert max-w-none">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  p({ node, children, ...props }: any) {
                    // Don't wrap code blocks in <p> tags
                    return <div className="my-2" {...props}>{children}</div>;
                  },
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    const childText = String(children);
                    
                    // Detect code blocks (triple backticks) and inline code
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {childText.replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : !inline ? (
                      // Code block without language (e.g., function signatures, commands)
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language="text"
                        PreTag="div"
                        customStyle={{
                          background: 'rgba(0, 0, 0, 0.5)',
                          padding: '1rem',
                          borderRadius: '0.5rem',
                        }}
                        {...props}
                      >
                        {childText.replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                  a({ node, children, href, ...props }: any) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline decoration-2 underline-offset-2 transition-colors font-medium"
                        {...props}
                      >
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          </div>
          
          {/* Citations and Timing Display */}
          {message.role === 'assistant' && (message.citations?.length || message.thinkingTime || message.responseTime) && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-4 text-xs text-muted-foreground px-2">
                {message.citations && message.citations.length > 0 && (
                  <div className="flex items-center gap-1.5">
                    <BookOpen className="h-3 w-3" />
                    <span>{message.citations.length} source{message.citations.length > 1 ? 's' : ''}</span>
                  </div>
                )}
                {message.thinkingTime && (
                  <div className="flex items-center gap-1.5">
                    <Zap className="h-3 w-3" />
                    <span>Think: {message.thinkingTime}s</span>
                  </div>
                )}
                {message.responseTime && (
                  <div className="flex items-center gap-1.5">
                    <Clock className="h-3 w-3" />
                    <span>Gen: {message.responseTime}s</span>
                  </div>
                )}
              </div>
              {message.citations?.map((citation) => {
                const filename = citation.document_source.split('/').pop() || citation.document_source;
                const pageNum = citation.metadata?.page || citation.metadata?.page_number;
                
                return (
                  <Button
                    key={citation.number}
                    variant="outline"
                    className="w-full justify-start h-auto p-2 hover:bg-accent"
                    onClick={() => handleCitationClick(citation)}
                  >
                    <div className="flex items-center gap-2 w-full">
                      <div className="flex-shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                        {citation.number}
                      </div>
                      <div className="flex-1 min-w-0 text-left">
                        <div className="flex items-center gap-1 text-sm">
                          <span className="font-medium truncate">{filename}</span>
                          {pageNum && (
                            <span className="text-muted-foreground flex-shrink-0">• Page {pageNum}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </Button>
                );
              })}
            </div>
          )}
        </div>
        {message.role === 'user' && (
          <div className="bg-primary p-2 rounded-lg h-8 w-8 flex-shrink-0 flex items-center justify-center">
            <User className="h-4 w-4 text-primary-foreground" />
          </div>
        )}
      </div>
      
      <CitationViewer
        citation={selectedCitation}
        open={citationViewerOpen}
        onOpenChange={setCitationViewerOpen}
      />
    </div>
  );
}
