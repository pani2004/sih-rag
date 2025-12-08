'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Hash, Calendar, BarChart, Eye, Loader2 } from 'lucide-react';
import { FileViewer } from './file-viewer';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import type { Citation } from '@/lib/types';

interface CitationViewerProps {
  citation: Citation | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CitationViewer({ citation, open, onOpenChange }: CitationViewerProps) {
  const [documentFileUrl, setDocumentFileUrl] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileType, setFileType] = useState<string>('');

  // Load document file when citation changes
  useEffect(() => {
    if (citation?.document_id && open) {
      setLoadingFile(true);
      setDocumentFileUrl(null);
      
      api.getDocumentFile(citation.document_id.toString())
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          setDocumentFileUrl(url);
          setFileType(blob.type);
          setLoadingFile(false);
        })
        .catch((error) => {
          console.error('Failed to load document file:', error);
          setLoadingFile(false);
        });
    }

    // Cleanup object URL on unmount or citation change
    return () => {
      if (documentFileUrl) {
        URL.revokeObjectURL(documentFileUrl);
      }
    };
  }, [citation?.document_id, open]);

  if (!citation) return null;

  const pageNumber = citation.metadata?.page || 1;
  const canPreview = documentFileUrl && (fileType === 'application/pdf' || fileType.startsWith('text/') || fileType.startsWith('audio/'));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {/* bg-background ensures proper light/dark mode behavior */}
      <DialogContent className="max-w-5xl max-h-[90vh] flex flex-col bg-background text-foreground">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Source Citation
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="content" className="flex-1 flex flex-col min-h-0">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="content" className="flex items-center gap-2">
              <FileText className="h-4 w-4" />
              Content
            </TabsTrigger>
            <TabsTrigger value="page" disabled={!canPreview || loadingFile} className="flex items-center gap-2">
              <Eye className="h-4 w-4" />
              Page View
            </TabsTrigger>
            <TabsTrigger value="metadata" className="flex items-center gap-2">
              <Hash className="h-4 w-4" />
              Metadata
            </TabsTrigger>
          </TabsList>

          <TabsContent value="content" className="flex-1 min-h-0 mt-4">
            <ScrollArea className="h-full bg-background">
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

            {/* Content Display */}
            <div className="rounded-lg bg-muted/80 border border-border p-4 shadow-sm">
              <p className="text-sm leading-relaxed whitespace-pre-wrap text-foreground">
                {citation.content}
              </p>
            </div>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="page" className="flex-1 min-h-0 mt-4">
            {loadingFile ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  <span>Loading document...</span>
                </div>
              </div>
            ) : documentFileUrl && canPreview ? (
              <FileViewer 
                fileUrl={documentFileUrl} 
                fileName={citation.document_title}
                fileType={fileType}
                initialPage={pageNumber} 
                className="h-full" 
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                <FileText className="h-12 w-12" />
                <p>Preview not available for this file type</p>
              </div>
            )}
          </TabsContent>

          <TabsContent value="metadata" className="flex-1 min-h-0 mt-4">
            <ScrollArea className="h-full">
              <div className="space-y-6 pr-4">
              {/* Additional Metadata */}
              {citation.metadata && Object.keys(citation.metadata).length > 0 && (
                <div className="space-y-3">
                  <h4 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                    Chunk Metadata
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
                    {citation.metadata.page && (
                      <div>
                        <span className="text-xs text-muted-foreground">Page Number</span>
                        <p className="text-sm font-medium">{citation.metadata.page}</p>
                      </div>
                    )}
                    {citation.metadata.token_count && (
                      <div>
                        <span className="text-xs text-muted-foreground">Token Count</span>
                        <p className="text-sm font-medium">{citation.metadata.token_count}</p>
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
              )}

              {/* IDs */}
              <Separator />
              <div className="space-y-3">
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
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
