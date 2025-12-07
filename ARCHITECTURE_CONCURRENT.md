# Concurrent Chat Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         USER BROWSER                             │
│                                                                   │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │Conversation A│  │Conversation B│  │Conversation C│          │
│  │   (Active)   │  │ (Processing) │  │   (Active)   │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                  │                  │                   │
│         └──────────────────┴──────────────────┘                   │
│                            │                                      │
│                    ┌───────▼────────┐                            │
│                    │  React State   │                            │
│                    │   (Zustand)    │                            │
│                    └───────┬────────┘                            │
└────────────────────────────┼─────────────────────────────────────┘
                             │
                             │ HTTP/SSE
                             │
┌────────────────────────────▼─────────────────────────────────────┐
│                      FRONTEND (Next.js)                           │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                    API Routes                               │ │
│  │                                                             │ │
│  │  POST /api/chat/job          ← Create new chat job        │ │
│  │  GET  /api/chat/job/[jobId]  ← Poll job status            │ │
│  │  *     /api/inngest           ← Inngest webhook            │ │
│  └────────────┬────────────────────────────────┬──────────────┘ │
│               │                                 │                 │
│               │                                 │                 │
│  ┌────────────▼──────────┐       ┌─────────────▼─────────────┐  │
│  │   useInngestChat()    │       │  Inngest Functions        │  │
│  │   - Job creation      │       │  - process-chat-message   │  │
│  │   - Status polling    │       │  - Multi-step workflow    │  │
│  │   - State updates     │       │  - Error handling         │  │
│  └───────────────────────┘       └───────────────────────────┘  │
│                                                                   │
└───────────────────────────┬───────────────────────────────────────┘
                            │
                            │ Events
                            │
┌───────────────────────────▼───────────────────────────────────────┐
│                    INNGEST PLATFORM                                │
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                    Event Bus                                  ││
│  │                                                               ││
│  │  Event: "chat/message.sent"                                  ││
│  │    ├─> Triggers: process-chat-message function              ││
│  │    └─> Data: { sessionId, message, history }                ││
│  │                                                               ││
│  │  Event: "chat/message.completed"                             ││
│  │    └─> Data: { sessionId, response, citations }             ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                    │
│  ┌──────────────────────────────────────────────────────────────┐│
│  │                 Function Executor                             ││
│  │                                                               ││
│  │  Step 1: search-knowledge-base                               ││
│  │    └─> POST /search (Backend API)                           ││
│  │                                                               ││
│  │  Step 2: generate-response                                   ││
│  │    └─> POST /chat (Backend API)                             ││
│  │                                                               ││
│  │  Step 3: store-result                                        ││
│  │    └─> POST /api/chat/job/[jobId] (Frontend API)           ││
│  └──────────────────────────────────────────────────────────────┘│
│                                                                    │
│  Dev UI: http://localhost:8288                                    │
└────────────────────────────┬───────────────────────────────────────┘
                             │
                             │ HTTP Requests
                             │
┌────────────────────────────▼───────────────────────────────────────┐
│                     BACKEND (FastAPI)                               │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                    API Endpoints                              │ │
│  │                                                               │ │
│  │  POST /chat         ← Generate chat response                │ │
│  │  POST /chat/stream  ← Stream response (SSE)                 │ │
│  │  POST /search       ← Vector similarity search              │ │
│  │  GET  /health       ← System health check                   │ │
│  └───────────┬──────────────────────────┬───────────────────────┘ │
│              │                           │                          │
│  ┌───────────▼──────────┐   ┌───────────▼──────────┐              │
│  │   RAG Engine         │   │   Vector Search      │              │
│  │   - Context building │   │   - PGVector query   │              │
│  │   - Prompt creation  │   │   - Hybrid search    │              │
│  │   - LLM integration  │   │   - Reranking        │              │
│  └───────────┬──────────┘   └──────────────────────┘              │
│              │                                                      │
│  ┌───────────▼──────────┐                                          │
│  │   Ollama Client      │                                          │
│  │   - mistral (LLM)    │                                          │
│  │   - nomic-embed-text │                                          │
│  └──────────────────────┘                                          │
└─────────────────────────────────────────────────────────────────────┘
                             ║
                             ║ SQL Queries
                             ║
┌────────────────────────────▼──────────────────────────────────────┐
│                PostgreSQL + PGVector                               │
│                                                                    │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐           │
│  │  documents   │  │    chunks    │  │   vectors    │           │
│  │  table       │  │    table     │  │   (768-dim)  │           │
│  └──────────────┘  └──────────────┘  └──────────────┘           │
└────────────────────────────────────────────────────────────────────┘
```

## Message Flow (Concurrent Mode)

### User Sends Message
```
1. User types in Conversation A: "What is RAG?"
   └─> addMessage({ role: 'user', content: '...' })
   └─> useChatStore updates conversation state

2. Frontend calls: api.sendChatJob(message, conversationId)
   └─> POST /api/chat/job
   └─> Returns: { jobId: "evt_123..." }

3. Store updated: setConversationProcessing(convId, true, jobId)
   └─> Conversation A shows "Processing..." indicator
```

### Inngest Processes Job
```
4. Inngest receives event: "chat/message.sent"
   └─> Triggers: chatProcessingFunction

5. Step 1: Search knowledge base
   └─> POST http://localhost:8000/search
   └─> Returns: { results: [...citations] }

6. Step 2: Generate response
   └─> POST http://localhost:8000/chat
   └─> Returns: { response: "...", citations: [...] }

7. Step 3: Store result
   └─> POST /api/chat/job/evt_123
   └─> Stores: { status: 'completed', response: "...", citations: [...] }
```

### Frontend Receives Response
```
8. Frontend polls every 2 seconds
   └─> GET /api/chat/job/evt_123
   └─> Checks status

9. When status === 'completed':
   └─> Stop polling
   └─> addMessage({ role: 'assistant', content: response, citations })
   └─> setConversationProcessing(convId, false)
   └─> Show response in UI
```

## Concurrent Sessions Example

```
Time: T0
┌──────────────────────────────────────────────────────────┐
│ Conversation A: User sends "What is RAG?"                │
│ Status: Processing (jobId: evt_001)                      │
└──────────────────────────────────────────────────────────┘

Time: T0 + 1s
┌──────────────────────────────────────────────────────────┐
│ Conversation A: Still processing...                      │
│ Conversation B: User sends "Explain embeddings"          │
│ Status: Processing (jobId: evt_002)                      │
└──────────────────────────────────────────────────────────┘

Time: T0 + 2s
┌──────────────────────────────────────────────────────────┐
│ Conversation A: Still processing...                      │
│ Conversation B: Still processing...                      │
│ Conversation C: User sends "What is a transformer?"      │
│ Status: Processing (jobId: evt_003)                      │
└──────────────────────────────────────────────────────────┘

Time: T0 + 4s
┌──────────────────────────────────────────────────────────┐
│ Conversation A: ✅ Response received!                    │
│ Conversation B: Still processing...                      │
│ Conversation C: Still processing...                      │
└──────────────────────────────────────────────────────────┘

Time: T0 + 6s
┌──────────────────────────────────────────────────────────┐
│ Conversation A: ✅ Complete                              │
│ Conversation B: ✅ Response received!                    │
│ Conversation C: Still processing...                      │
└──────────────────────────────────────────────────────────┘

Time: T0 + 7s
┌──────────────────────────────────────────────────────────┐
│ Conversation A: ✅ Complete                              │
│ Conversation B: ✅ Complete                              │
│ Conversation C: ✅ Response received!                    │
└──────────────────────────────────────────────────────────┘

Result: All 3 conversations processed in ~7 seconds total
        (vs 15+ seconds if sequential)
```

## Key Components

### Frontend
- **useInngestChat hook**: Manages job lifecycle for each conversation
- **Polling mechanism**: Checks job status every 2 seconds
- **State management**: Tracks processing state per conversation

### Inngest
- **Event-driven**: Responds to chat events
- **Step-based execution**: Retryable, observable steps
- **Background processing**: Non-blocking architecture

### Backend
- **Stateless**: Each request is independent
- **RESTful**: Standard HTTP endpoints
- **Fast**: Optimized for concurrent requests

## Benefits

1. **Non-blocking UI**: Start new chats while others process
2. **Parallel execution**: Multiple jobs run simultaneously
3. **Resilient**: Built-in retry and error handling
4. **Observable**: Full visibility into job execution
5. **Scalable**: Handles many concurrent users

## Monitoring Points

### Frontend
- Conversation processing state
- Job IDs and polling activity
- User interactions

### Inngest (localhost:8288)
- Function executions
- Step completions
- Error traces
- Performance metrics

### Backend
- API request logs
- Database queries
- Ollama model calls
- Vector searches

## Performance Characteristics

| Metric | Single Mode | Concurrent Mode |
|--------|-------------|-----------------|
| Conversations | 1 active | 10+ active |
| Response Time | 2-3s | 2-5s (per job) |
| Throughput | 1 req/time | N req/time |
| UI Blocking | Yes | No |
| Scalability | Limited | High |
