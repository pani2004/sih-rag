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

  // Direct text highlighting - simpler approach
  useEffect(() => {
    if (!highlightText || !pageRendered) {
      console.log('Highlight skipped:', { hasText: !!highlightText, pageRendered });
      return;
    }

    console.log('Starting highlight for:', highlightText.substring(0, 80));

    let isCancelled = false;
    let retryCount = 0;

    const applyHighlight = () => {
      if (isCancelled) return;

      const textLayer = document.querySelector('.react-pdf__Page__textContent') as HTMLElement;
      
      if (!textLayer) {
        console.log('Text layer not found, retry:', retryCount);
        if (retryCount < 20) {
          retryCount++;
          setTimeout(applyHighlight, 300);
        }
        return;
      }

      const spans = Array.from(textLayer.querySelectorAll('span')) as HTMLElement[];

      if (spans.length === 0) {
        console.log('No spans found, retry:', retryCount);
        if (retryCount < 20) {
          retryCount++;
          setTimeout(applyHighlight, 300);
        }
        return;
      }

      console.log('Found', spans.length, 'text spans');

      // Clear previous highlights
      spans.forEach(span => {
        span.style.backgroundColor = '';
        span.style.color = '';
        span.style.fontWeight = '';
        span.style.padding = '';
      });

      const searchText = highlightText.toLowerCase().replace(/\s+/g, ' ').trim();
      let fullText = '';
      const spanMap: { span: HTMLElement; start: number; end: number }[] = [];
      
      spans.forEach((span) => {
        const text = span.textContent || '';
        spanMap.push({
          span,
          start: fullText.length,
          end: fullText.length + text.length,
        });
        fullText += text.toLowerCase();
      });

      console.log('Total text length:', fullText.length);

      // Try finding the text with multiple strategies
      let matchStart = fullText.indexOf(searchText.substring(0, 100));
      
      if (matchStart === -1) {
        matchStart = fullText.indexOf(searchText.substring(0, 50));
      }
      
      if (matchStart === -1) {
        matchStart = fullText.indexOf(searchText.substring(0, 30));
      }

      if (matchStart !== -1) {
        const matchEnd = matchStart + Math.min(searchText.length, 250);
        console.log('Match found from', matchStart, 'to', matchEnd);
        
        let highlighted = 0;
        spanMap.forEach(({ span, start, end }) => {
          if (end > matchStart && start < matchEnd) {
            span.style.backgroundColor = '#FFFF00';
            span.style.color = '#000000';
            span.style.fontWeight = 'bold';
            span.style.padding = '2px 4px';
            span.style.borderRadius = '3px';
            highlighted++;
          }
        });
        console.log('Highlighted', highlighted, 'spans');
      } else {
        console.log('No match found. Search:', searchText.substring(0, 50));
        console.log('Text preview:', fullText.substring(0, 100));
      }
    };

    const timer = setTimeout(applyHighlight, 1000);
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
