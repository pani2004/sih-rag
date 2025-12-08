'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Loader2 } from 'lucide-react';

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

  useEffect(() => {
    setPageNumber(initialPage);
  }, [initialPage]);

  // Custom text renderer to highlight the citation text
  function customTextRenderer(textItem: any) {
    if (!highlightText) return textItem.str;
    
    const searchText = highlightText.toLowerCase().replace(/\s+/g, ' ').trim();
    const itemText = textItem.str.toLowerCase();
    
    if (searchText.includes(itemText) || itemText.includes(searchText.substring(0, 50))) {
      return textItem.str;
    }
    
    return textItem.str;
  }

  // Highlight matching text in the PDF after rendering
  useEffect(() => {
    if (!highlightText) return;

    const highlightMatches = () => {
      const textLayer = document.querySelector('.react-pdf__Page__textContent');
      if (!textLayer) return;

      const searchText = highlightText.toLowerCase().replace(/\s+/g, ' ').trim().substring(0, 200);
      const spans = textLayer.querySelectorAll('span');
      
      spans.forEach(span => {
        span.style.backgroundColor = '';
        span.style.color = '';
      });

      let accumulatedText = '';
      const matchingSpans: HTMLElement[] = [];
      
      spans.forEach((span, index) => {
        accumulatedText += span.textContent?.toLowerCase() || '';
        matchingSpans.push(span as HTMLElement);
        
        if (accumulatedText.length >= searchText.length) {
          if (accumulatedText.includes(searchText)) {
            matchingSpans.forEach(s => {
              s.style.backgroundColor = 'rgba(255, 255, 0, 0.4)';
              s.style.color = 'black';
              s.style.borderRadius = '2px';
            });
          }
          
          accumulatedText = accumulatedText.slice(1);
          matchingSpans.shift();
        }
      });
    };

    const timer = setTimeout(highlightMatches, 500);
    return () => clearTimeout(timer);
  }, [highlightText, pageNumber, scale]);

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
            customTextRenderer={highlightText ? customTextRenderer : undefined}
          />
        </Document>
      </div>
    </div>
  );
}
