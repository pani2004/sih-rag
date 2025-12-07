# Concurrent Chat Sessions with Inngest

This implementation uses [Inngest](https://www.inngest.com/) to enable multiple chat sessions to run simultaneously without blocking each other.

## Features

- **Multiple Concurrent Sessions**: Chat in different conversations at the same time
- **Background Job Processing**: Messages are processed asynchronously via Inngest
- **Real-time Status Updates**: Poll for job completion and receive responses
- **Fallback to Streaming**: Toggle between concurrent mode and traditional streaming mode
- **Per-Session State**: Each conversation maintains its own processing state

## Architecture

### Frontend
1. **Inngest Client** (`src/lib/inngest/client.ts`): Initializes the Inngest client
2. **Inngest Functions** (`src/lib/inngest/functions.ts`): Defines the chat processing workflow
3. **API Routes**:
   - `/api/inngest`: Inngest webhook endpoint for function execution
   - `/api/chat/job`: Create new chat jobs
   - `/api/chat/job/[jobId]`: Query and update job status
4. **Custom Hook** (`src/hooks/use-inngest-chat.ts`): React hook for managing concurrent chat sessions
5. **Store Updates** (`src/lib/store.ts`): Added job tracking to conversation state

### Backend
- The existing FastAPI backend handles chat processing
- Inngest functions call the backend API endpoints to perform searches and generate responses

## How It Works

### 1. Sending a Message
```typescript
// User sends a message in a conversation
const result = await api.sendChatJob({
  message: userMessage.content,
  conversation_history: messages,
}, conversationId);

// Returns a jobId for tracking
```

### 2. Background Processing
```typescript
// Inngest function processes the message in the background
chatProcessingFunction = inngest.createFunction(
  { id: "process-chat-message" },
  { event: "chat/message.sent" },
  async ({ event, step }) => {
    // Step 1: Search knowledge base
    const citations = await step.run("search-knowledge-base", ...);
    
    // Step 2: Generate response
    const response = await step.run("generate-response", ...);
    
    // Step 3: Store result
    await step.run("store-result", ...);
  }
);
```

### 3. Polling for Results
```typescript
// Frontend polls for job completion
const status = await api.getChatJobStatus(jobId);

if (status.status === 'completed') {
  // Display the response
  addMessage({ 
    role: 'assistant', 
    content: status.response, 
    citations: status.citations 
  });
}
```

## Configuration

### Development Setup

1. **Install Dependencies**:
   ```bash
   cd frontend
   npm install inngest
   ```

2. **Start Inngest Dev Server** (optional for local development):
   ```bash
   npx inngest-cli@latest dev
   ```
   The Inngest dev server runs at `http://localhost:8288` and provides:
   - Function execution
   - Event logs
   - Debugging UI

3. **Start Your Application**:
   ```bash
   npm run dev
   ```

### Production Setup

1. **Sign up for Inngest**: Visit [inngest.com](https://www.inngest.com/)

2. **Get Your Keys**:
   - Event Key: For sending events
   - Signing Key: For securing webhooks

3. **Set Environment Variables**:
   ```bash
   INNGEST_EVENT_KEY=your_event_key_here
   INNGEST_SIGNING_KEY=your_signing_key_here
   NEXT_PUBLIC_BASE_URL=https://your-domain.com
   ```

4. **Deploy**: Inngest will automatically discover your functions via the `/api/inngest` endpoint

## Usage

### Toggle Concurrent Mode

1. Click the **Settings** dropdown in the header
2. Enable **Concurrent Mode** to use Inngest-based chat
3. Disable to fall back to traditional streaming mode

### Benefits of Concurrent Mode

- ✅ Chat in multiple conversations simultaneously
- ✅ Switch between conversations while messages are processing
- ✅ No blocking - start new queries while waiting for responses
- ✅ Reliable background processing with retry logic
- ✅ Built-in observability with Inngest dashboard

### When to Use Each Mode

**Concurrent Mode (Inngest)**:
- Multiple active conversations
- Long-running queries
- Need for reliability and retries
- Production environments with high concurrency

**Streaming Mode (Traditional)**:
- Single conversation focus
- Real-time character-by-character streaming
- Simple use cases
- Development/testing

## Job States

| State | Description |
|-------|-------------|
| `pending` | Job created, waiting to start |
| `processing` | Currently being processed |
| `completed` | Successfully finished |
| `failed` | Error occurred during processing |

## API Endpoints

### POST /api/chat/job
Create a new chat job.

**Request**:
```json
{
  "message": "What is RAG?",
  "conversation_history": [...],
  "sessionId": "conv-123"
}
```

**Response**:
```json
{
  "jobId": "evt_01234567890",
  "status": "pending"
}
```

### GET /api/chat/job/[jobId]
Get job status and results.

**Response**:
```json
{
  "status": "completed",
  "response": "RAG stands for...",
  "citations": [...]
}
```

## Monitoring

### Inngest Dashboard
- View all function runs
- Debug failed jobs
- Monitor performance
- Replay events

### Local Development
Visit `http://localhost:8288` to access the Inngest dev UI.

## Troubleshooting

### Jobs Not Processing
1. Check if Inngest dev server is running: `npx inngest-cli@latest dev`
2. Verify the `/api/inngest` route is accessible
3. Check browser console for errors

### Slow Polling
The default polling interval is 2 seconds. To adjust:
```typescript
// In use-inngest-chat.ts
pollingIntervalRef.current = setInterval(() => {
  pollJobStatus(jobId);
}, 1000); // Poll every 1 second
```

### Missing Responses
Job results are stored in memory and expire after 1 hour. For production, consider using:
- Redis for distributed storage
- Inngest's built-in state management
- Database persistence

## Future Enhancements

- [ ] WebSocket integration for instant updates instead of polling
- [ ] Redis-based job result storage
- [ ] Batch message processing
- [ ] Priority queues for different message types
- [ ] Rate limiting per conversation
- [ ] Analytics and performance metrics

## Learn More

- [Inngest Documentation](https://www.inngest.com/docs)
- [Inngest TypeScript SDK](https://www.inngest.com/docs/reference/typescript)
- [Next.js Integration](https://www.inngest.com/docs/sdk/serve#framework-next-js)
