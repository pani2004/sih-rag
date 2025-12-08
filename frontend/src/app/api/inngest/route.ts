import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { processChatMessageFunction, processDocumentFunction } from "@/lib/inngest/functions";

// Create an API that serves zero or more Inngest functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processChatMessageFunction,
    processDocumentFunction,
  ],
});
