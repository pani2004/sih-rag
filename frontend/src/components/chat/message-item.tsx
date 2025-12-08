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
            <div className="mt-2 space-y-2">
              {/* Thinking Process Accordion */}
              {message.citations && message.citations.length > 0 && (
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="thinking" className="border rounded-lg bg-muted/30">
                    <AccordionTrigger className="px-3 py-2 hover:no-underline">
                      <div className="flex items-center gap-4 text-xs">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Zap className="h-3 w-3" />
                          <span className="font-medium">Thinking Process</span>
                        </div>
                        <div className="flex items-center gap-4 text-muted-foreground">
                          <div className="flex items-center gap-1.5">
                            <BookOpen className="h-3 w-3" />
                            <span>{message.citations.length} source{message.citations.length > 1 ? 's' : ''}</span>
                          </div>
                          {message.thinkingTime && (
                            <div className="flex items-center gap-1.5">
                              <Zap className="h-3 w-3" />
                              <span>Search: {message.thinkingTime}s</span>
                            </div>
                          )}
                          {message.responseTime && (
                            <div className="flex items-center gap-1.5">
                              <Clock className="h-3 w-3" />
                              <span>Gen: {message.responseTime}s</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-3 pb-3 pt-0">
                      <div className="space-y-2">
                        <div className="text-xs text-muted-foreground mb-2">
                          Retrieved and analyzed {message.citations.length} relevant sources:
                        </div>
                        {message.citations.map((citation) => {
                          const filename = citation.document_source.split('/').pop() || citation.document_source;
                          const pageNum = citation.metadata?.page || citation.metadata?.page_number;
                          const chunkInfo = citation.metadata?.chunk_method ? 
                            `${citation.metadata.chunk_method} • ` : '';
                          
                          return (
                            <div
                              key={citation.number}
                              className="border rounded-md p-2 bg-background hover:bg-accent cursor-pointer transition-colors"
                              onClick={() => handleCitationClick(citation)}
                            >
                              <div className="flex items-start gap-2">
                                <div className="shrink-0 h-5 w-5 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-semibold mt-0.5">
                                  {citation.number}
                                </div>
                                <div className="flex-1 min-w-0 space-y-1">
                                  <div className="flex items-center gap-1 text-xs">
                                    <span className="font-semibold truncate">{filename}</span>
                                    {pageNum && (
                                      <span className="text-muted-foreground shrink-0">• Page {pageNum}</span>
                                    )}
                                  </div>
                                  <p className="text-xs text-muted-foreground line-clamp-2">
                                    {citation.content.replace(/GLYPH<[^>]+>/g, '').trim().substring(0, 150)}...
                                  </p>
                                  {citation.similarity !== undefined && (
                                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                      <span className="text-[10px]">
                                        {chunkInfo}Relevance: {citation.similarity.toFixed(2)}
                                      </span>
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              )}

              {/* Quick Citation Buttons (kept for backward compatibility) */}
              <div className="flex flex-wrap gap-1">
                {message.citations?.slice(0, 3).map((citation) => {
                  const filename = citation.document_source.split('/').pop() || citation.document_source;
                  const pageNum = citation.metadata?.page || citation.metadata?.page_number;
                  
                  return (
                    <Button
                      key={citation.number}
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => handleCitationClick(citation)}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold">[{citation.number}]</span>
                        <span className="truncate max-w-[150px]">{filename}</span>
                        {pageNum && <span className="text-muted-foreground">p.{pageNum}</span>}
                      </div>
                    </Button>
                  );
                })}
                {message.citations && message.citations.length > 3 && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground"
                    disabled
                  >
                    +{message.citations.length - 3} more
                  </Button>
                )}
              </div>
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
