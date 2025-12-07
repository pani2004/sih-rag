'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { FileText, X, Upload, Eye, Edit2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';

interface Document {
  id: string;
  title: string;
  source: string;
  chunk_count?: number;
  created_at?: string;
  metadata?: any;
}

interface DocumentsSidebarProps {
  show: boolean;
  documents: Document[];
  onClose: () => void;
  onRefetch: () => void;
  uploading: boolean;
  uploadProgress: number;
  uploadingFileName: string;
  onFileSelect: () => void;
  isDraggingOver: boolean;
  onDragEnter: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onViewDocument: (doc: Document) => void;
  onEditDocument: (doc: Document) => void;
}

export function DocumentsSidebar({
  show,
  documents,
  onClose,
  onRefetch,
  uploading,
  uploadProgress,
  uploadingFileName,
  onFileSelect,
  isDraggingOver,
  onDragEnter,
  onDragLeave,
  onDragOver,
  onDrop,
  onViewDocument,
  onEditDocument,
}: DocumentsSidebarProps) {
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
            initial={{ x: 320, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            exit={{ x: 320, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            className="w-full md:w-1/2 border-l bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 flex flex-col h-full fixed right-0 top-0 z-30 shadow-lg"
            onDragEnter={onDragEnter}
            onDragLeave={onDragLeave}
            onDragOver={onDragOver}
            onDrop={onDrop}
          >
            <div className="p-4 border-b flex items-center justify-between flex-shrink-0">
              <h3 className="font-semibold">Documents</h3>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={onClose}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            
            {/* Drag and Drop Overlay */}
            {isDraggingOver && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 bg-primary/10 backdrop-blur-sm z-50 flex items-center justify-center pointer-events-none"
              >
                <div className="bg-background border-2 border-dashed border-primary rounded-lg p-8 text-center">
                  <Upload className="h-12 w-12 text-primary mx-auto mb-4" />
                  <p className="text-lg font-semibold text-primary mb-2">Drop file here</p>
                  <p className="text-sm text-muted-foreground">
                    PDF, Word, PowerPoint, Excel, Markdown, Text, or Audio
                  </p>
                </div>
              </motion.div>
            )}
            
            <ScrollArea className="flex-1 p-4 overflow-y-auto">
              <div className="space-y-3">
                {/* Upload Zone Card */}
                <Card 
                  className="p-6 border-2 border-dashed border-muted-foreground/20 hover:border-primary/50 hover:bg-primary/5 transition-all cursor-pointer"
                  onClick={onFileSelect}
                >
                  <div className="flex flex-col items-center text-center gap-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                      <Upload className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-medium mb-1">
                        {uploading ? 'Uploading...' : 'Drop files here or click to upload'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        PDF, Word, PowerPoint, Excel, Markdown, Text, Audio
                      </p>
                    </div>
                    {uploading && (
                      <div className="w-full space-y-2">
                        <p className="text-xs text-muted-foreground">
                          {uploadingFileName}
                        </p>
                        <Progress value={uploadProgress} className="h-2" />
                      </div>
                    )}
                  </div>
                </Card>

                {/* Documents List */}
                {documents.map((doc) => (
                  <Card key={doc.id} className="p-3 group hover:bg-muted/50 transition-colors relative">
                    <div className="flex items-center gap-3">
                      <FileText className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <p className="text-sm font-medium truncate" title={doc.title}>{doc.title}</p>
                        <p className="text-xs text-muted-foreground truncate" title={doc.source}>
                          {doc.source}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {doc.chunk_count || 0} chunks
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0 ml-auto opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="View document"
                          onClick={(e) => {
                            e.stopPropagation();
                            onViewDocument(doc);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8"
                          title="Edit document"
                          onClick={(e) => {
                            e.stopPropagation();
                            onEditDocument(doc);
                          }}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                          title="Delete document"
                          onClick={async (e) => {
                            e.stopPropagation();
                            try {
                              await api.deleteDocument(Number(doc.id));
                              toast.success('Document deleted');
                              onRefetch();
                            } catch (error: any) {
                              toast.error('Failed to delete: ' + error.message);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </Card>
                ))}
                {documents.length === 0 && (
                  <div className="text-center py-8 text-sm text-muted-foreground">
                    Your documents will appear here
                  </div>
                )}
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
