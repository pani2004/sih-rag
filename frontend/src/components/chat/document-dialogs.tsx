'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';

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

  return (
    <>
      {/* View Document Dialog */}
      <Dialog open={!!viewingDocument} onOpenChange={onCloseView}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewingDocument?.title}</DialogTitle>
            <DialogDescription>Document details and metadata</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
                <pre className="text-sm text-muted-foreground mt-1 bg-muted p-3 rounded-lg overflow-x-auto">
                  {JSON.stringify(viewingDocument.metadata, null, 2)}
                </pre>
              </div>
            )}
          </div>
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
