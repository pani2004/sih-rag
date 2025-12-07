'use client';

import { useState } from 'react';
import { Sparkles, User, BookOpen } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
                  code({ node, inline, className, children, ...props }: any) {
                    const match = /language-(\w+)/.exec(className || '');
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, '')}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                }}
              >
                {message.content}
              </ReactMarkdown>
            </div>
          </div>
          
          {/* Citations Display */}
          {message.role === 'assistant' && message.citations && message.citations.length > 0 && (
            <div className="mt-2 space-y-1">
              <div className="flex items-center gap-2 text-sm text-muted-foreground px-2">
                <BookOpen className="h-3 w-3" />
                <span>{message.citations.length} source{message.citations.length > 1 ? 's' : ''}</span>
              </div>
              {message.citations.map((citation) => {
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
