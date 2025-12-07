# Testing Concurrent Chat Sessions

This guide walks you through testing the concurrent chat feature to ensure multiple sessions can run simultaneously.

## Prerequisites

1. **Backend Running**: Make sure your FastAPI backend is running on port 8000
   ```bash
   # In the backend directory
   python -m uvicorn backend.main:app --reload
   ```

2. **Inngest Dev Server Running**: Should be running on port 8288
   ```bash
   # In the frontend directory
   npx inngest-cli@latest dev
   ```

3. **Frontend Running**: Next.js app on port 3000
   ```bash
   # In the frontend directory
   npm run dev
   ```

## Test Scenarios

### Test 1: Basic Concurrent Sessions

**Objective**: Verify that two conversations can process messages simultaneously

**Steps**:
1. Open the RAG Assistant in your browser (`http://localhost:3000`)
2. Enable "Concurrent Mode" in the Settings dropdown
3. Create a new conversation (Conversation A)
4. Ask a question: "What is retrieval augmented generation?"
5. **Immediately** click "+ New Chat" to create Conversation B
6. In Conversation B, ask: "Explain vector databases"
7. Switch back to Conversation A
8. Verify both conversations show processing indicators
9. Wait for both responses to complete

**Expected Results**:
- ✅ Both conversations process independently
- ✅ You can switch between conversations while they're processing
- ✅ Both responses eventually appear in their respective conversations
- ✅ No interference between the two sessions

### Test 2: Multiple Concurrent Sessions (Stress Test)

**Objective**: Test system behavior with many concurrent sessions

**Steps**:
1. Enable "Concurrent Mode"
2. Create 5 different conversations
3. In rapid succession, send a message in each conversation:
   - Conv 1: "What is machine learning?"
   - Conv 2: "Explain neural networks"
   - Conv 3: "What are transformers?"
   - Conv 4: "Describe embeddings"
   - Conv 5: "What is semantic search?"
4. Navigate between all conversations
5. Monitor the processing status in each

**Expected Results**:
- ✅ All 5 conversations process in parallel
- ✅ System remains responsive
- ✅ All responses complete successfully
- ✅ No timeouts or errors

### Test 3: Switching Between Streaming and Concurrent Modes

**Objective**: Verify mode switching works correctly

**Steps**:
1. Start in "Streaming Mode" (disable Concurrent Mode)
2. Send a message and observe character-by-character streaming
3. Wait for response to complete
4. Switch to "Concurrent Mode" via Settings
5. Send another message in the same conversation
6. Observe job-based processing with status updates
7. Switch back to "Streaming Mode"
8. Send a third message and verify streaming resumes

**Expected Results**:
- ✅ Streaming mode shows real-time text generation
- ✅ Concurrent mode shows processing status
- ✅ Mode changes apply immediately to new messages
- ✅ No errors when switching modes

### Test 4: Job Status Persistence

**Objective**: Verify job status is maintained across page reloads

**Steps**:
1. Enable "Concurrent Mode"
2. Send a message that will take time to process
3. **Before the response completes**, refresh the page
4. Navigate to the conversation where you sent the message

**Expected Results**:
- ✅ Conversation state is restored from localStorage
- ✅ Processing indicator may still be shown (or response may have completed)
- ✅ No duplicate messages
- ✅ System handles gracefully

### Test 5: Error Handling

**Objective**: Test error scenarios

**Steps**:
1. Stop the backend server
2. Enable "Concurrent Mode"
3. Send a message
4. Observe error handling
5. Restart the backend
6. Send another message
7. Verify normal operation resumes

**Expected Results**:
- ✅ Clear error message displayed to user
- ✅ System doesn't crash or hang
- ✅ After backend restart, new messages process correctly
- ✅ Failed messages don't leave orphaned jobs

## Monitoring During Tests

### Inngest Dev UI
Open `http://localhost:8288` to monitor:
- Function executions
- Event logs
- Step-by-step execution
- Error traces

### Browser Console
Monitor for:
- API errors
- State updates
- Job ID assignments
- Polling activity

### Network Tab
Watch for:
- POST requests to `/api/chat/job`
- GET requests polling `/api/chat/job/[jobId]`
- Backend API calls from Inngest functions

## Performance Benchmarks

| Scenario | Concurrent Sessions | Avg Response Time | Success Rate |
|----------|---------------------|-------------------|--------------|
| Single Session | 1 | ~2-3s | 100% |
| Dual Sessions | 2 | ~3-4s | 100% |
| Multiple Sessions | 5 | ~4-6s | 100% |
| Stress Test | 10+ | ~6-10s | 95%+ |

*Times vary based on model performance and query complexity*

## Common Issues and Solutions

### Issue: Jobs stuck in "pending" state
**Solution**: 
- Check Inngest dev server is running
- Verify `/api/inngest` endpoint is accessible
- Check browser console for errors

### Issue: Responses not appearing
**Solution**:
- Check if polling is active (should see GET requests every 2s)
- Verify job results are being stored (check API route logs)
- Try refreshing the page

### Issue: "Failed to send chat job" error
**Solution**:
- Verify frontend is running and accessible
- Check that conversation ID is valid
- Ensure API endpoint is correct

### Issue: Slow performance with many sessions
**Solution**:
- This is expected behavior - each job processes sequentially
- Consider implementing worker pools or multiple Inngest instances
- Optimize backend response time

## Cleanup After Testing

1. Stop Inngest dev server (Ctrl+C)
2. Clear localStorage if needed (browser DevTools > Application > Storage)
3. Remove test conversations from sidebar

## Next Steps

After successful testing:
1. Deploy to production with real Inngest keys
2. Set up monitoring and alerting
3. Configure Redis for distributed job storage
4. Implement WebSocket for real-time updates
5. Add rate limiting per user/session

## Reporting Issues

If you encounter issues during testing:
1. Check all three services are running (Backend, Frontend, Inngest)
2. Review console logs and Inngest UI
3. Note the specific steps that led to the issue
4. Document expected vs actual behavior
5. Check the `CONCURRENT_CHAT.md` troubleshooting section
