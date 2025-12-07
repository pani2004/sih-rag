# Quick Start: Concurrent Chat

Get started with concurrent chat sessions in 3 minutes!

## Step 1: Start Services (3 terminals)

### Terminal 1: Inngest Dev Server
```bash
cd frontend
npx inngest-cli@latest dev
```
✅ Should show: "Inngest Dev Server online at 0.0.0.0:8288"

### Terminal 2: Frontend
```bash
cd frontend
npm run dev
```
✅ Should show: "Ready on http://localhost:3000"

### Terminal 3: Backend (if not already running)
```bash
# Using Docker
docker compose up -d

# OR using Python directly
cd backend
python -m uvicorn backend.main:app --reload
```
✅ Should show backend running on port 8000

## Step 2: Verify Concurrent Mode (Enabled by Default)

1. Open http://localhost:3000
2. Concurrent mode is **enabled by default**! ✅
3. (Optional) Click **Settings** to toggle modes
4. You're ready!

## Step 3: Test It Out!

### Quick Test (30 seconds)
1. Send a message: "What is RAG?"
2. **Immediately** click "+ New Chat"
3. In the new conversation, ask: "Explain embeddings"
4. Switch back and forth between conversations
5. Both should be processing independently! 🎉

### Visual Indicators
- 🔄 **Processing...** - Job is running
- ✅ **Response** - Job completed
- ❌ **Error** - Something went wrong

## Step 4: Monitor (Optional)

Open http://localhost:8288 to see:
- Real-time function executions
- Event logs
- Step-by-step processing
- Performance metrics

## How to Switch Modes

### Back to Streaming Mode
1. Click **Settings**
2. Uncheck ❌ **Concurrent Mode**
3. Now messages stream character-by-character

### Concurrent vs Streaming

| Feature | Concurrent Mode | Streaming Mode |
|---------|----------------|----------------|
| Multiple parallel chats | ✅ Yes | ❌ No |
| Real-time streaming | ❌ No | ✅ Yes |
| Background processing | ✅ Yes | ❌ No |
| Switch conversations | ✅ Yes | ⚠️ Limited |
| Best for | Multi-tasking | Single focus |

## Troubleshooting

### "Processing..." stuck?
- ✅ Check Terminal 1 - Inngest should be running
- ✅ Check Terminal 3 - Backend should be running
- ✅ Refresh the page

### No response appearing?
- ✅ Open browser console (F12) for errors
- ✅ Check http://localhost:8288 for job logs
- ✅ Verify backend is accessible at http://localhost:8000/health

### "Failed to send chat job"?
- ✅ Make sure you're on http://localhost:3000
- ✅ Verify frontend is running (Terminal 2)
- ✅ Check that Concurrent Mode is enabled

## Next Steps

- 📚 Read [CONCURRENT_CHAT.md](./CONCURRENT_CHAT.md) for full documentation
- 🧪 Follow [TESTING_CONCURRENT_CHAT.md](./TESTING_CONCURRENT_CHAT.md) for comprehensive tests
- 📋 See [IMPLEMENTATION_SUMMARY.md](./IMPLEMENTATION_SUMMARY.md) for technical details

## Pro Tips

1. **Use multiple browser tabs** - Open different conversations in separate tabs for easier multitasking
2. **Monitor the Inngest UI** - Keep http://localhost:8288 open in another tab
3. **Name your conversations** - Hover over conversation titles in sidebar to rename
4. **Check the logs** - Browser console shows real-time polling activity

## Example Workflow

```
1. Open RAG Assistant
2. Enable Concurrent Mode
3. Start Conversation A: "Summarize the company overview"
4. Create Conversation B: "What are the team roles?"
5. Create Conversation C: "Explain the implementation plan"
6. Watch all three process simultaneously! ⚡
```

## Success! 🎉

You're now running concurrent chat sessions! Try chatting in 3-5 conversations at once to see the full power of parallel processing.

Happy chatting! 💬
