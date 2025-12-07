import { Inngest } from "inngest";

// Create a client to send and receive events
export const inngest = new Inngest({ 
  id: "rag-chat-app",
  eventKey: process.env.INNGEST_EVENT_KEY,
});

// Helper to send events
export async function sendInngestEvent(name: string, data: any) {
  try {
    await inngest.send({
      name,
      data,
    });
  } catch (error) {
    console.warn('Failed to send Inngest event:', error);
  }
}
