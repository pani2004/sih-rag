'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useChatStore } from '@/lib/store';

export function useFileUpload(conversationId: string, onRefetch: () => void) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFileName, setUploadingFileName] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const { addMessage } = useChatStore();

  const processFileUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    setUploadingFileName(file.name);

    const uploadStartMessage = {
      role: 'assistant' as const,
      content: `📎 Processing **${file.name}**...`,
    };
    addMessage(conversationId, uploadStartMessage);

    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => Math.min(prev + 10, 90));
    }, 200);

    try {
      const response = await api.uploadFile(file);
      setUploadProgress(100);
      
      const successMessage = {
        role: 'assistant' as const,
        content: `✅ Successfully uploaded and processed **${file.name}**!\n\n📊 Created ${response.chunks_created} searchable chunks.\n\nYou can now ask questions about this document.`,
      };
      addMessage(conversationId, successMessage);
      
      toast.success('Document processed successfully!');
      onRefetch();
    } catch (error: any) {
      const errorMessage = {
        role: 'assistant' as const,
        content: `❌ Failed to upload **${file.name}**: ${error.message}`,
      };
      addMessage(conversationId, errorMessage);
      toast.error(`Upload failed: ${error.message}`);
    } finally {
      clearInterval(progressInterval);
      setUploading(false);
      setUploadProgress(0);
      setUploadingFileName('');
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    e.target.value = '';
    await processFileUpload(file);
  };

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget === e.target) {
      setIsDraggingOver(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);

    if (uploading) {
      toast.error('Please wait for the current upload to finish');
      return;
    }

    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;

    if (files.length > 1) {
      toast.error('Please upload one file at a time');
      return;
    }

    const file = files[0];
    const allowedExtensions = ['.pdf', '.docx', '.pptx', '.xlsx', '.md', '.txt', '.mp3', '.wav', '.m4a', '.flac'];
    const fileExtension = '.' + file.name.split('.').pop()?.toLowerCase();

    if (!allowedExtensions.includes(fileExtension)) {
      toast.error('Unsupported file type. Please upload PDF, Word, PowerPoint, Excel, Markdown, Text, or Audio files.');
      return;
    }

    await processFileUpload(file);
  };

  return {
    uploading,
    uploadProgress,
    uploadingFileName,
    isDraggingOver,
    handleFileUpload,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  };
}
