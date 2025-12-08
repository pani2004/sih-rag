import { inngest } from "./client";
import type { ChatMessage } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface DocumentEvent {
  data: {
    jobId: string;
    documentId: string;
    fileName: string;
    filePath: string;
  };
}

interface ChatEvent {
  data: {
    sessionId: string;
    conversationId: string;
    message: string;
    conversationHistory: ChatMessage[];
  };
}

// Main chat processing function
export const processChatMessageFunction = inngest.createFunction(
  { 
    id: "process-chat-message",
    concurrency: {
      limit: 10, // Allow 10 concurrent chat sessions
    },
  },
  { event: "chat/message.sent" },
  async ({ event, step }) => {
    const { sessionId, conversationId, message, conversationHistory } = event.data;

    console.log(`[Inngest] Processing chat for session ${sessionId}, conversation ${conversationId}`);

    // Step 1: Search knowledge base
    const searchResults = await step.run("search-knowledge-base", async () => {
      console.log(`[Inngest] Searching knowledge base for: "${message.substring(0, 50)}..."`);
      
      const response = await fetch(`${API_URL}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: message,
          top_k: 5,
        }),
      });

      if (!response.ok) {
        throw new Error(`Search failed: ${response.statusText}`);
      }

      const data = await response.json();
      const citations = data.results.map((result: any, index: number) => ({
        number: index + 1,
        chunk_id: result.chunk_id,
        document_id: result.document_id,
        document_title: result.document_title,
        document_source: result.document_source,
        content: result.content,
        metadata: result.metadata,
        similarity: result.similarity,
      }));

      console.log(`[Inngest] Found ${citations.length} relevant chunks`);
      return citations;
    });

    // Step 2: Generate response using backend
    const chatResponse = await step.run("generate-response", async () => {
      console.log(`[Inngest] Generating response for session ${sessionId}`);
      
      const response = await fetch(`${API_URL}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          conversation_history: conversationHistory,
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat generation failed: ${response.statusText}`);
      }

      const data = await response.json();
      console.log(`[Inngest] Response generated: ${data.response.substring(0, 100)}...`);
      
      return {
        response: data.response,
        citations: data.citations || searchResults,
        conversationHistory: data.conversation_history,
      };
    });

    // Step 3: Store result in session storage
    await step.run("store-result", async () => {
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
      
      await fetch(`${baseUrl}/api/chat/session/${sessionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId,
          status: 'completed',
          response: chatResponse.response,
          citations: chatResponse.citations,
          conversationHistory: chatResponse.conversationHistory,
          timestamp: Date.now(),
        }),
      });

      console.log(`[Inngest] Result stored for session ${sessionId}`);
      return { stored: true };
    });

    // Step 4: Send completion event
    await step.sendEvent("send-completion", {
      name: "chat/message.completed",
      data: {
        sessionId,
        conversationId,
        response: chatResponse.response,
        citations: chatResponse.citations,
        conversationHistory: chatResponse.conversationHistory,
        success: true,
      },
    });

    console.log(`[Inngest] Completed processing for session ${sessionId}`);

    return { 
      sessionId,
      conversationId,
      success: true,
      responseLength: chatResponse.response.length,
      citationsCount: chatResponse.citations.length,
    };
  }
);

// Document processing function for background embedding
export const processDocumentFunction = inngest.createFunction(
  { 
    id: "process-document",
    concurrency: {
      limit: 5, // Allow 5 concurrent document processing jobs
    },
  },
  { event: "document/uploaded" },
  async ({ event, step }) => {
    const { jobId, documentId, fileName, filePath } = event.data;

    console.log(`[Inngest] 📄 Starting document processing`);
    console.log(`[Inngest]   - Document ID: ${documentId}`);
    console.log(`[Inngest]   - File: ${fileName}`);
    console.log(`[Inngest]   - Job ID: ${jobId}`);

    try {
      // Step 1: Update job status to processing
      await step.run("update-status-processing", async () => {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        
        await fetch(`${baseUrl}/api/documents/job/${jobId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'processing',
            message: 'Starting document processing...',
            progress: 10,
          }),
        });

        console.log(`[Inngest] ✓ Job ${jobId} status: processing`);
      });

      // Step 2a: Notify starting chunking phase
      await step.run("update-status-chunking", async () => {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        
        console.log(`[Inngest] 🔍 Phase 1/3: Reading and chunking document`);
        
        await fetch(`${baseUrl}/api/documents/job/${jobId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'processing',
            message: 'Reading document and creating chunks...',
            progress: 25,
          }),
        });

        console.log(`[Inngest] ✓ Job ${jobId} - chunking phase started`);
      });

      // Step 2b: Process document through ingestion pipeline
      const ingestionResult = await step.run("ingest-document", async () => {
        console.log(`[Inngest] 🔄 Phase 2/3: Processing document through pipeline`);
        console.log(`[Inngest]   - Calling backend /ingest-by-id endpoint`);
        
        const response = await fetch(`${API_URL}/ingest-by-id`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            document_id: documentId,  // Send as string (UUID)
          }),
        });

        if (!response.ok) {
          const errorText = await response.text();
          console.error(`[Inngest] ❌ Ingestion failed: ${response.statusText}`);
          console.error(`[Inngest]   Error details: ${errorText}`);
          throw new Error(`Ingestion failed: ${response.statusText}`);
        }

        const data = await response.json();
        console.log(`[Inngest] ✅ Chunking completed!`);
        console.log(`[Inngest]   - Total chunks created: ${data.chunks_created || 0}`);
        console.log(`[Inngest]   - Status: ${data.status}`);
        
        return data;
      });

      // Step 2c: Notify embedding phase
      await step.run("update-status-embedding", async () => {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const chunkCount = ingestionResult.chunks_created || 0;
        
        console.log(`[Inngest] ⚡ Phase 3/3: Generating vector embeddings`);
        console.log(`[Inngest]   - Processing ${chunkCount} chunks in parallel`);
        console.log(`[Inngest]   - Using optimized batch processing`);
        
        await fetch(`${baseUrl}/api/documents/job/${jobId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'processing',
            message: `Generating embeddings for ${chunkCount} chunks (parallel processing)...`,
            progress: 50,
          }),
        });

        console.log(`[Inngest] ✓ Embedding phase in progress...`);
      });

      // Step 3: Update job status to completed
      await step.run("update-status-completed", async () => {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        const chunkCount = ingestionResult.chunks_created || 0;
        
        console.log(`[Inngest] 🎉 Processing completed successfully!`);
        console.log(`[Inngest]   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`[Inngest]   📊 Summary:`);
        console.log(`[Inngest]      • File: ${fileName}`);
        console.log(`[Inngest]      • Chunks created: ${chunkCount}`);
        console.log(`[Inngest]      • Embeddings generated: ${chunkCount}`);
        console.log(`[Inngest]      • Status: Ready for queries`);
        console.log(`[Inngest]   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        
        await fetch(`${baseUrl}/api/documents/job/${jobId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'completed',
            message: `✅ Successfully processed: ${chunkCount} chunks created and embedded`,
            progress: 100,
            result: ingestionResult,
          }),
        });

        console.log(`[Inngest] ✓ Job ${jobId} marked as completed`);
      });

      // Step 4: Send completion event
      await step.sendEvent("send-document-completion", {
        name: "document/processed",
        data: {
          jobId,
          documentId,
          fileName,
          success: true,
          chunksCreated: ingestionResult.chunks_created,
        },
      });

      console.log(`[Inngest] Document ${documentId} processing completed`);

      return {
        success: true,
        jobId,
        documentId,
        chunksCreated: ingestionResult.chunks_created,
      };

    } catch (error: any) {
      console.error(`[Inngest] ❌ ERROR: Document processing failed`);
      console.error(`[Inngest]   - Document: ${fileName}`);
      console.error(`[Inngest]   - Error: ${error.message}`);
      console.error(`[Inngest]   - Stack:`, error.stack);

      // Update job status to failed
      await step.run("update-status-failed", async () => {
        const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
        
        await fetch(`${baseUrl}/api/documents/job/${jobId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'failed',
            message: error.message || 'Document processing failed',
            error: error.toString(),
          }),
        });
      });

      throw error;
    }
  }
);
