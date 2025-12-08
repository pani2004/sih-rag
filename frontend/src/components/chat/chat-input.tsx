'use client';

import { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { Send, Paperclip, FileText, Square } from 'lucide-react';

interface ChatInputProps {
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  onFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onStop: () => void;
  isStreaming: boolean;
  uploading: boolean;
  uploadProgress: number;
  uploadingFileName: string;
  disabled?: boolean;
}

export function ChatInput({
  input,
  onInputChange,
  onSend,
  onFileUpload,
  onStop,
  isStreaming,
  uploading,
  uploadProgress,
  uploadingFileName,
  disabled = false,
}: ChatInputProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSend();
    }
  };

  return (
    <div className="border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex-shrink-0">
      <div className="container max-w-4xl mx-auto px-4 py-4">
        {uploading && (
          <div className="mb-3 p-4 bg-muted rounded-xl border border-border">
            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">
                  {uploadingFileName}
                </p>
                <p className="text-xs text-muted-foreground">
                  Processing document...
                </p>
              </div>
              <span className="text-sm font-medium">{uploadProgress}%</span>
            </div>
            <Progress value={uploadProgress} className="h-1.5" />
          </div>
        )}
        <div className="relative">
          <Textarea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Message RAG Assistant..."
            className="min-h-[60px] pr-24 resize-none rounded-2xl"
            disabled={isStreaming || disabled}
          />
          <div className="absolute right-2 bottom-2 flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              onChange={onFileUpload}
              accept=".pdf,.docx,.pptx,.xlsx,.md,.txt,.mp3,.wav,.m4a,.flac,.jpg,.jpeg,.png,.tiff,.tif,.bmp,.webp"
            />
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 rounded-lg"
              onClick={() => fileInputRef.current?.click()}
            >
              <Paperclip className="h-4 w-4" />
            </Button>
            {isStreaming ? (
              <Button
                onClick={onStop}
                size="icon"
                className="h-8 w-8 rounded-lg"
                variant="destructive"
              >
                <Square className="h-4 w-4 fill-current" />
              </Button>
            ) : (
              <Button
                onClick={onSend}
                disabled={!input.trim() || disabled}
                size="icon"
                className="h-8 w-8 rounded-lg"
              >
                <Send className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        <p className="text-xs text-muted-foreground text-center mt-2">
          Upload documents with the paperclip or ask questions directly
        </p>
      </div>
    </div>
  );
}
