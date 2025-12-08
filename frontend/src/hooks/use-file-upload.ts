'use client';

import { useState } from 'react';
import { api } from '@/lib/api';
import { toast } from 'sonner';
import { useChatStore } from '@/lib/store';

interface ProcessingJob {
  jobId: string;
  fileName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  result?: any;
}

export function useFileUpload(conversationId: string, onRefetch: () => void) {
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadingFileName, setUploadingFileName] = useState('');
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [processingJobs, setProcessingJobs] = useState<Map<string, ProcessingJob>>(new Map());

  const { addMessage } = useChatStore();

  const processFileUpload = async (file: File) => {
    setUploading(true);
    setUploadProgress(0);
    setUploadingFileName(file.name);

    // Show toast notification instead of chat message for non-blocking UX
    toast.info(`Uploading ${file.name}...`);

    const progressInterval = setInterval(() => {
      setUploadProgress((prev) => Math.min(prev + 10, 50));
    }, 200);

    try {
      // Step 1: Upload file to backend
      const uploadResponse = await api.uploadFile(file);
      setUploadProgress(60);
      
      toast.success(`${file.name} uploaded! Processing in background...`);

      // Step 2: Create background job via Inngest
      if (!uploadResponse.document_id) {
        throw new Error('No document ID returned from upload');
      }

      const jobResponse = await fetch('/api/documents/job', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: uploadResponse.document_id,
          fileName: file.name,
          filePath: uploadResponse.filename,
        }),
      });

      if (!jobResponse.ok) {
        throw new Error('Failed to create processing job');
      }

      const { jobId } = await jobResponse.json();
      
      toast.success(`📄 ${file.name} uploaded! Processing in background...`, { duration: 4000 });
      
      // Reset upload state immediately to allow more uploads and chatting
      setUploading(false);
      setUploadProgress(0);
      setUploadingFileName('');
      
      // Add initial processing job to the Map
      setProcessingJobs(prev => new Map(prev).set(jobId, {
        jobId,
        fileName: file.name,
        status: 'pending',
        progress: 0,
        message: 'Starting...',
      }));
      
      // Step 3: Poll for job completion with real-time progress (non-blocking)
      const pollInterval = setInterval(async () => {
        try {
          const statusResponse = await fetch(`/api/documents/job/${jobId}`);
          if (!statusResponse.ok) return;

          const jobStatus = await statusResponse.json();
          
          // Update processing job in real-time
          setProcessingJobs(prev => new Map(prev).set(jobId, {
            jobId,
            fileName: file.name,
            status: jobStatus.status,
            progress: jobStatus.progress || 0,
            message: jobStatus.message || '',
            result: jobStatus.result,
          }));
          
          if (jobStatus.status === 'completed') {
            clearInterval(pollInterval);
            
            // Update UI in real-time when processing completes
            toast.success(
              `✅ ${file.name} ready! Created ${jobStatus.result?.chunks_created || 'multiple'} chunks.`,
              { duration: 5000 }
            );
            
            // Remove from processing jobs after 3 seconds
            setTimeout(() => {
              setProcessingJobs(prev => {
                const updated = new Map(prev);
                updated.delete(jobId);
                return updated;
              });
            }, 3000);
            
            // Refetch documents immediately to show updated list
            await onRefetch();
          } else if (jobStatus.status === 'failed') {
            clearInterval(pollInterval);
            toast.error(`❌ ${file.name} processing failed: ${jobStatus.message || 'Unknown error'}`, { duration: 5000 });
            
            // Remove from processing jobs after 5 seconds
            setTimeout(() => {
              setProcessingJobs(prev => {
                const updated = new Map(prev);
                updated.delete(jobId);
                return updated;
              });
            }, 5000);
          }
        } catch (error) {
          console.error('Polling error:', error);
        }
      }, 2000); // Poll every 2 seconds

      // Cleanup polling after 5 minutes
      setTimeout(() => {
        clearInterval(pollInterval);
      }, 300000);

    } catch (error: any) {
      const errorMessage = {
        role: 'assistant' as const,
        content: `❌ Failed to upload **${file.name}**: ${error.message}`,
      };
      addMessage(conversationId, errorMessage);
      toast.error(`Upload failed: ${error.message}`);
      
      setUploading(false);
      setUploadProgress(0);
      setUploadingFileName('');
    } finally {
      clearInterval(progressInterval);
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
    processingJobs,
    handleFileUpload,
    handleDragEnter,
    handleDragLeave,
    handleDragOver,
    handleDrop,
  };
}
