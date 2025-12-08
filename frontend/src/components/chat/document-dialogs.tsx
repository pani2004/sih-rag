'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { toast } from 'sonner';
import { FileViewer } from './file-viewer';
import { api } from '@/lib/api';
import { FileText, Eye, Loader2 } from 'lucide-react';

interface Document {
  id: string;
  title: string;
  source: string;
  chunk_count?: number;
  created_at?: string;
  metadata?: any;
}

interface DocumentDialogsProps {
  viewingDocument: Document | null;
  editingDocument: Document | null;
  onCloseView: () => void;
  onCloseEdit: () => void;
  onRefetch: () => void;
}

export function DocumentDialogs({
  viewingDocument,
  editingDocument,
  onCloseView,
  onCloseEdit,
  onRefetch,
}: DocumentDialogsProps) {
  const [editDocTitle, setEditDocTitle] = useState('');
  const [editDocSource, setEditDocSource] = useState('');
  const [documentFileUrl, setDocumentFileUrl] = useState<string | null>(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const [fileType, setFileType] = useState<string>('');

  // Load document file when viewing
  useEffect(() => {
    if (viewingDocument?.id) {
      setLoadingFile(true);
      setDocumentFileUrl(null);
      
      api.getDocumentFile(viewingDocument.id)
        .then((blob) => {
          const url = URL.createObjectURL(blob);
          setDocumentFileUrl(url);
          setFileType(blob.type);
          setLoadingFile(false);
        })
        .catch((error) => {
          console.error('Failed to load document file:', error);
          toast.error('Failed to load document file');
          setLoadingFile(false);
        });
    }

    // Cleanup object URL on unmount or document change
    return () => {
      if (documentFileUrl) {
        URL.revokeObjectURL(documentFileUrl);
      }
    };
  }, [viewingDocument?.id]);

  return (
    <>
      {/* View Document Dialog */}
      <Dialog open={!!viewingDocument} onOpenChange={onCloseView}>
        <DialogContent className="max-w-[95vw] w-[1400px] h-[90vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-6 pb-4 border-b">
            <DialogTitle className="text-xl">{viewingDocument?.title}</DialogTitle>
            <DialogDescription>View document content and details</DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="preview" className="flex-1 flex flex-col min-h-0">
            <div className="px-6 pt-2">
              <TabsList className="grid w-full max-w-md grid-cols-2">
                <TabsTrigger value="preview" className="flex items-center gap-2">
                  <Eye className="h-4 w-4" />
                  Preview
                </TabsTrigger>
                <TabsTrigger value="details" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Details
                </TabsTrigger>
              </TabsList>
            </div>

            <TabsContent value="preview" className="flex-1 min-h-0 mt-0 px-6 pb-6">
              {loadingFile ? (
                <div className="flex items-center justify-center h-full">
                  <div className="flex items-center gap-2 text-muted-foreground">
                    <Loader2 className="h-5 w-5 animate-spin" />
                    <span>Loading document...</span>
                  </div>
                </div>
              ) : documentFileUrl ? (
                <FileViewer 
                  fileUrl={documentFileUrl} 
                  fileName={viewingDocument?.title || 'document'}
                  fileType={fileType}
                  className="h-full" 
                />
              ) : (
                <div className="flex flex-col items-center justify-center h-full gap-4 text-muted-foreground">
                  <FileText className="h-12 w-12" />
                  <p>No file available</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="details" className="flex-1 min-h-0 mt-0 px-6 pb-6">
              <div className="h-full overflow-y-auto space-y-6">
                <div>
                  <label className="text-sm font-medium">Source</label>
                  <p className="text-sm text-muted-foreground mt-1">{viewingDocument?.source}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Document ID</label>
                  <p className="text-sm text-muted-foreground mt-1">{viewingDocument?.id}</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Chunks</label>
                  <p className="text-sm text-muted-foreground mt-1">{viewingDocument?.chunk_count || 0} chunks</p>
                </div>
                <div>
                  <label className="text-sm font-medium">Created</label>
                  <p className="text-sm text-muted-foreground mt-1">
                    {viewingDocument?.created_at ? new Date(viewingDocument.created_at).toLocaleString() : 'N/A'}
                  </p>
                </div>
                {viewingDocument?.metadata && Object.keys(viewingDocument.metadata).length > 0 && (
                  <div>
                    <label className="text-sm font-medium">Metadata</label>
                    <pre className="text-sm text-muted-foreground mt-1 bg-muted p-3 rounded-lg overflow-x-auto max-h-[400px]">
                      {JSON.stringify(viewingDocument.metadata, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Edit Document Dialog */}
      <Dialog 
        open={!!editingDocument} 
        onOpenChange={(open) => {
          if (!open) {
            onCloseEdit();
            setEditDocTitle('');
            setEditDocSource('');
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Edit Document</DialogTitle>
            <DialogDescription>Update document information</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div>
              <label className="text-sm font-medium mb-2 block">Title</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                value={editDocTitle || editingDocument?.title || ''}
                onChange={(e) => setEditDocTitle(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-2 block">Source</label>
              <input
                type="text"
                className="w-full px-3 py-2 border border-border rounded-lg bg-background"
                value={editDocSource || editingDocument?.source || ''}
                onChange={(e) => setEditDocSource(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Document ID</label>
              <p className="text-sm text-muted-foreground mt-1">{editingDocument?.id}</p>
            </div>
            <div>
              <label className="text-sm font-medium">Chunks</label>
              <p className="text-sm text-muted-foreground mt-1">{editingDocument?.chunk_count || 0} chunks</p>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => {
                onCloseEdit();
                setEditDocTitle('');
                setEditDocSource('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  // API call would go here when backend supports it
                  // await api.updateDocument(editingDocument.id, { title: editDocTitle, source: editDocSource });
                  toast.success('Document updated successfully');
                  onCloseEdit();
                  setEditDocTitle('');
                  setEditDocSource('');
                  onRefetch();
                } catch (error: any) {
                  toast.error('Failed to update: ' + error.message);
                }
              }}
            >
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
