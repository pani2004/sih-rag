'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { Button } from '@/components/ui/button';
import { FileText, Download, Loader2, Volume2, FileSpreadsheet, FileCode } from 'lucide-react';

const PDFViewer = dynamic(() => import('./pdf-viewer').then(mod => ({ default: mod.PDFViewer })), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full">
      <Loader2 className="h-8 w-8 animate-spin" />
    </div>
  ),
});

interface FileViewerProps {
  fileUrl: string;
  fileName: string;
  fileType: string;
  initialPage?: number;
  className?: string;
}

export function FileViewer({ fileUrl, fileName, fileType, initialPage = 1, className = '' }: FileViewerProps) {
  const [audioError, setAudioError] = useState(false);

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = fileUrl;
    a.download = fileName;
    a.click();
  };

  // PDF files
  if (fileType === 'application/pdf') {
    return <PDFViewer fileUrl={fileUrl} initialPage={initialPage} className={className} />;
  }

  // Text-based files (Markdown, Text)
  if (fileType === 'text/plain' || fileType === 'text/markdown') {
    return (
      <div className={`flex flex-col ${className}`}>
        <div className="flex items-center justify-between gap-4 p-4 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <FileCode className="h-5 w-5" />
            <span className="text-sm font-medium">{fileName}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
        <div className="flex-1 overflow-auto bg-muted/20 p-6">
          <iframe
            src={fileUrl}
            className="w-full h-full min-h-[600px] bg-background rounded border"
            title={fileName}
          />
        </div>
      </div>
    );
  }

  // Audio files
  if (fileType.startsWith('audio/')) {
    return (
      <div className={`flex flex-col ${className}`}>
        <div className="flex items-center justify-between gap-4 p-4 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Volume2 className="h-5 w-5" />
            <span className="text-sm font-medium">{fileName}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
        <div className="flex-1 overflow-auto bg-muted/20 flex items-center justify-center p-6">
          {!audioError ? (
            <div className="w-full max-w-2xl">
              <audio
                controls
                className="w-full"
                onError={() => setAudioError(true)}
              >
                <source src={fileUrl} type={fileType} />
                Your browser does not support the audio element.
              </audio>
              <div className="mt-4 text-center text-sm text-muted-foreground">
                <p>{fileName}</p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-4 text-muted-foreground">
              <Volume2 className="h-12 w-12" />
              <p>Unable to play audio file</p>
              <Button variant="outline" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Download to play locally
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Word, Excel, PowerPoint - Show download option with preview via Google Docs Viewer
  if (
    fileType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    fileType === 'application/msword' ||
    fileType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    fileType === 'application/vnd.ms-excel' ||
    fileType === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' ||
    fileType === 'application/vnd.ms-powerpoint'
  ) {
    const icon = fileType.includes('spreadsheet') || fileType.includes('excel') 
      ? FileSpreadsheet 
      : FileText;
    const Icon = icon;

    return (
      <div className={`flex flex-col ${className}`}>
        <div className="flex items-center justify-between gap-4 p-4 border-b bg-muted/30">
          <div className="flex items-center gap-2">
            <Icon className="h-5 w-5" />
            <span className="text-sm font-medium">{fileName}</span>
          </div>
          <Button variant="outline" size="sm" onClick={handleDownload}>
            <Download className="h-4 w-4 mr-2" />
            Download
          </Button>
        </div>
        <div className="flex-1 overflow-auto bg-muted/20 p-6">
          <div className="bg-background rounded border p-8 text-center space-y-4">
            <Icon className="h-16 w-16 mx-auto text-muted-foreground" />
            <div>
              <h3 className="font-semibold text-lg">{fileName}</h3>
              <p className="text-sm text-muted-foreground mt-2">
                {fileType.includes('word') && 'Word Document'}
                {fileType.includes('spreadsheet') && 'Excel Spreadsheet'}
                {fileType.includes('excel') && 'Excel Spreadsheet'}
                {fileType.includes('presentation') && 'PowerPoint Presentation'}
                {fileType.includes('powerpoint') && 'PowerPoint Presentation'}
              </p>
            </div>
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Download to view the full document with formatting
              </p>
              <Button onClick={handleDownload} size="lg">
                <Download className="h-4 w-4 mr-2" />
                Download File
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Fallback for unknown file types
  return (
    <div className={`flex flex-col h-full ${className}`}>
      <div className="flex items-center justify-between gap-4 p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          <span className="text-sm font-medium">{fileName}</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleDownload}>
          <Download className="h-4 w-4 mr-2" />
          Download
        </Button>
      </div>
      <div className="flex-1 flex flex-col items-center justify-center bg-muted/20 p-8">
        <FileText className="h-16 w-16 text-muted-foreground mb-4" />
        <h3 className="font-semibold text-lg mb-2">Preview Unavailable</h3>
        <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
          This file type ({fileType}) cannot be previewed in the browser.
          Download the file to view it with a compatible application.
        </p>
        <Button onClick={handleDownload} size="lg">
          <Download className="h-4 w-4 mr-2" />
          Download File
        </Button>
      </div>
    </div>
  );
}
