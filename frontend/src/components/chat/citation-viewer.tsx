'use client';

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { FileText, Hash, Calendar, BarChart } from 'lucide-react';
import type { Citation } from '@/lib/types';

interface CitationViewerProps {
  citation: Citation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CitationViewer({ citation, open, onOpenChange }: CitationViewerProps) {
  if (!citation) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* bg-background ensures proper light/dark mode behavior */}
      <DialogContent className="max-w-3xl max-h-[80vh] bg-background text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Source Citation
          </DialogTitle>
        </DialogHeader>

        {/* ScrollArea also gets background to ensure visual consistency */}
        <ScrollArea className="max-h-[60vh] bg-background">
          <div className="space-y-6 pr-4">

            {/* Document Info */}
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h3 className="font-semibold text-lg">{citation.document_title}</h3>
                  <p className="text-sm text-muted-foreground">{citation.document_source}</p>
                </div>
                <Badge variant="secondary" className="shrink-0">
                  Citation {citation.number}
                </Badge>
              </div>

              {/* Metadata Badges */}
              <div className="flex flex-wrap gap-2">
                {citation.metadata?.page && (
                  <Badge variant="outline" className="gap-1">
                    <Hash className="h-3 w-3" />
                    Page {citation.metadata.page}
                  </Badge>
                )}
                {citation.similarity !== undefined && (
                  <Badge variant="outline" className="gap-1">
                    <BarChart className="h-3 w-3" />
                    Relevance: {(Math.abs(citation.similarity) * 100).toFixed(1)}%
                  </Badge>
                )}
                {citation.metadata?.token_count && (
                  <Badge variant="outline">
                    {citation.metadata.token_count} tokens
                  </Badge>
                )}
              </div>
            </div>

            <Separator />

            {/* Content */}
            <div className="space-y-2">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Content
              </h4>

              {/* Enhanced visibility with border and better contrast */}
              <div className="rounded-lg bg-muted/80 border border-border p-4 shadow-sm">
                <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                  {citation.content}
                </p>
              </div>
            </div>

            {/* Additional Metadata */}
            {citation.metadata && Object.keys(citation.metadata).length > 0 && (
              <>
                <Separator />
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Metadata
                  </h4>

                  <div className="grid grid-cols-2 gap-3">
                    {citation.metadata.chunk_method && (
                      <div>
                        <span className="text-xs text-muted-foreground">Chunk Method</span>
                        <p className="text-sm font-medium">{citation.metadata.chunk_method}</p>
                      </div>
                    )}
                    {citation.metadata.total_chunks && (
                      <div>
                        <span className="text-xs text-muted-foreground">Total Chunks</span>
                        <p className="text-sm font-medium">{citation.metadata.total_chunks}</p>
                      </div>
                    )}
                    {citation.metadata.uploaded && (
                      <div>
                        <span className="text-xs text-muted-foreground">Status</span>
                        <p className="text-sm font-medium">
                          <Badge variant="secondary" className="text-xs">Uploaded</Badge>
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* IDs */}
            <Separator />
            <div className="space-y-2">
              <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                Identifiers
              </h4>

              <div className="space-y-2 text-xs font-mono">
                <div>
                  <span className="text-muted-foreground">Document ID:</span>
                  <p className="break-all">{citation.document_id}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Chunk ID:</span>
                  <p className="break-all">{citation.chunk_id}</p>
                </div>
              </div>
            </div>

          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
