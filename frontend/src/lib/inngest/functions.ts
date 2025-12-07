import { inngest } from "./client";
import type { ChatMessage } from "@/lib/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

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
