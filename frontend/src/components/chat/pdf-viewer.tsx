'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';
import 'react-pdf/dist/Page/TextLayer.css';
import 'react-pdf/dist/Page/AnnotationLayer.css';

// Dynamic import to avoid SSR issues with DOMMatrix
let Document: any;
let Page: any;
let pdfjs: any;

if (typeof window !== 'undefined') {
  const reactPdf = require('react-pdf');
  Document = reactPdf.Document;
  Page = reactPdf.Page;
  pdfjs = reactPdf.pdfjs;
  pdfjs.GlobalWorkerOptions.workerSrc = `//unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
}

interface PDFViewerProps {
  fileUrl: string;
  initialPage?: number;
  className?: string;
  highlightText?: string;
}

export function PDFViewer({ fileUrl, initialPage = 1, className = '', highlightText }: PDFViewerProps) {
  const [numPages, setNumPages] = useState<number>(0);
  const [pageNumber, setPageNumber] = useState<number>(initialPage);
  const [scale, setScale] = useState<number>(1.0);
  const [loading, setLoading] = useState<boolean>(true);
  const [pageRendered, setPageRendered] = useState<boolean>(false);

  useEffect(() => {
    setPageNumber(initialPage);
    setPageRendered(false);
  }, [initialPage]);

  useEffect(() => {
    setPageRendered(false);
  }, [pageNumber, scale]);

  // Add highlight overlay using canvas approach
  useEffect(() => {
    if (!highlightText || !pageRendered) return;

    let isCancelled = false;
    let retryCount = 0;

    const addHighlightOverlay = () => {
      if (isCancelled) return;

      const pageElement = document.querySelector('.react-pdf__Page');
      if (!pageElement) {
        if (retryCount < 15) {
          retryCount++;
          setTimeout(addHighlightOverlay, 200);
        }
        return;
      }

      // Remove existing highlight overlay
      const existingOverlay = pageElement.querySelector('.highlight-overlay');
      if (existingOverlay) {
        existingOverlay.remove();
      }

      const textLayer = pageElement.querySelector('.react-pdf__Page__textContent') as HTMLElement;
      if (!textLayer) {
        if (retryCount < 15) {
          retryCount++;
          setTimeout(addHighlightOverlay, 200);
        }
        return;
      }

      const searchText = highlightText.toLowerCase().replace(/\s+/g, ' ').trim();
      const spans = Array.from(textLayer.querySelectorAll('span'));

      if (spans.length === 0) {
        if (retryCount < 15) {
          retryCount++;
          setTimeout(addHighlightOverlay, 200);
        }
        return;
      }

      // Create overlay container
      const overlay = document.createElement('div');
      overlay.className = 'highlight-overlay';
      overlay.style.position = 'absolute';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.pointerEvents = 'none';
      overlay.style.zIndex = '1';

      // Find matching text spans
      let fullText = '';
      const spanMap: { text: string; span: HTMLElement; startIndex: number }[] = [];
      
      spans.forEach((span) => {
        const text = span.textContent || '';
        spanMap.push({
          text,
          span: span as HTMLElement,
          startIndex: fullText.length,
        });
        fullText += text;
      });

      const fullTextLower = fullText.toLowerCase();
      const searchIndex = fullTextLower.indexOf(searchText.substring(0, 100));

      if (searchIndex !== -1) {
        const endIndex = searchIndex + Math.min(searchText.length, 200);
        
        // Find spans that contain the highlighted text
        spanMap.forEach(({ span, startIndex, text }) => {
          const spanEndIndex = startIndex + text.length;
          
          if (spanEndIndex > searchIndex && startIndex < endIndex) {
            const rect = span.getBoundingClientRect();
            const pageRect = pageElement.getBoundingClientRect();
            
            const highlightBox = document.createElement('div');
            highlightBox.style.position = 'absolute';
            highlightBox.style.left = `${rect.left - pageRect.left}px`;
            highlightBox.style.top = `${rect.top - pageRect.top}px`;
            highlightBox.style.width = `${rect.width}px`;
            highlightBox.style.height = `${rect.height}px`;
            highlightBox.style.backgroundColor = 'rgba(255, 255, 0, 0.5)';
            highlightBox.style.mixBlendMode = 'multiply';
            
            overlay.appendChild(highlightBox);
          }
        });

        (pageElement as HTMLElement).style.position = 'relative';
        pageElement.appendChild(overlay);
      }
    };

    const timer = setTimeout(addHighlightOverlay, 500);
    return () => {
      isCancelled = true;
      clearTimeout(timer);
    };
  }, [highlightText, pageRendered]);

  function onDocumentLoadSuccess({ numPages }: { numPages: number }) {
    setNumPages(numPages);
    setLoading(false);
  }

  function onDocumentLoadError(error: Error) {
    console.error('Error loading PDF:', error);
    setLoading(false);
  }

  const goToPrevPage = () => setPageNumber((prev) => Math.max(1, prev - 1));
  const goToNextPage = () => setPageNumber((prev) => Math.min(numPages, prev + 1));
  const zoomIn = () => setScale((prev) => Math.min(2.0, prev + 0.1));
  const zoomOut = () => setScale((prev) => Math.max(0.5, prev - 0.1));

  return (
    <div className={`flex flex-col ${className}`}>
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 p-4 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={goToPrevPage}
            disabled={pageNumber <= 1 || loading}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium whitespace-nowrap">
            Page {pageNumber} of {numPages || '...'}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={goToNextPage}
            disabled={pageNumber >= numPages || loading}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={zoomOut}
            disabled={scale <= 0.5 || loading}
          >
            <ZoomOut className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium whitespace-nowrap">
            {Math.round(scale * 100)}%
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={zoomIn}
            disabled={scale >= 2.0 || loading}
          >
            <ZoomIn className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* PDF Display */}
      <div className="flex-1 overflow-auto bg-muted/20 flex items-center justify-center p-4">
        {loading && (
          <div className="flex items-center gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Loading PDF...</span>
          </div>
        )}
        <Document
          file={fileUrl}
          onLoadSuccess={onDocumentLoadSuccess}
          onLoadError={onDocumentLoadError}
          loading={null}
          className="flex justify-center"
        >
          <Page
            pageNumber={pageNumber}
            scale={scale}
            renderTextLayer={true}
            renderAnnotationLayer={false}
            className="shadow-lg"
            onRenderSuccess={() => setPageRendered(true)}
          />
        </Document>
      </div>
    </div>
  );
}
