# Embedding Error Fixes

## Problem
Ollama embedding API was experiencing connection failures with error:
```
500 - "do embedding request: Post http://127.0.0.1:51075/embedding: read tcp: wsarecv: An existing connection was forcibly closed by the remote host."
```

This occurred because:
1. No retry logic for transient connection failures
2. Batches processed too quickly, overwhelming Ollama
3. Poor error recovery and visibility

## Solutions Implemented

### 1. Retry Logic with Exponential Backoff
**File**: `backend/core/ollama_client.py`

Added automatic retry mechanism to `generate_embedding()`:
- **Max Retries**: 3 attempts
- **Backoff Strategy**: Exponential (2s, 4s, 8s)
- **Error Types Handled**: 
  - `HTTPStatusError` (500 errors)
  - `ConnectError` (connection refused)
  - `RemoteProtocolError` (connection forcibly closed)

```python
# Automatically retries failed embeddings with increasing delays
embedding = await ollama_client.generate_embedding(text, max_retries=3)
```

### 2. Batch Rate Limiting
**File**: `backend/ingestion/embedder.py`

Added delay between batches to prevent overwhelming Ollama:
- **Default Delay**: 0.5 seconds between batches
- **Configurable**: Can be adjusted via `batch_delay` parameter
- **Better Error Tracking**: Logs failed chunk indices

```python
# Processes batches with delay to give Ollama breathing room
embedded_chunks = await embedder.embed_chunks(chunks, batch_delay=0.5)
```

### 3. Reduced Batch Size
**File**: `backend/config.py`

New configuration options:
```python
embedding_batch_size: int = 25  # Reduced from 50
embedding_batch_delay: float = 0.5  # New: delay between batches
```

## Configuration Options

### Environment Variables
Add these to your `.env` file to tune embedding performance:

```bash
# Embedding Configuration
EMBEDDING_BATCH_SIZE=25          # Number of chunks per batch (lower = more stable)
EMBEDDING_BATCH_DELAY=0.5        # Seconds to wait between batches
OLLAMA_TIMEOUT=300               # Timeout for Ollama requests in seconds
```

### Performance Tuning Guide

| Scenario | `EMBEDDING_BATCH_SIZE` | `EMBEDDING_BATCH_DELAY` | Notes |
|----------|------------------------|-------------------------|-------|
| **Stable (Recommended)** | 25 | 0.5 | Default - best balance |
| **Fast (Risky)** | 50 | 0.2 | May cause errors if Ollama struggles |
| **Very Stable** | 10 | 1.0 | Slower but most reliable |
| **GPU Optimized** | 40 | 0.3 | If you have dedicated GPU |

## Expected Behavior

### Before Fix
```
Processing batch 4/10... (40%)
ERROR: Ollama embedding API error: 500 - connection forcibly closed
ERROR: Failed to embed chunk 155
```

### After Fix
```
Processing batch 4/10... (40%)
WARNING: Ollama embedding error (attempt 1/3): 500. Retrying in 2s...
[2 second delay]
Processing batch 4/10... (40%) - Retry successful
[0.5 second delay before next batch]
Processing batch 5/10... (50%)
```

## Error Recovery

The system now handles errors gracefully:
1. **Automatic Retries**: 3 attempts with exponential backoff
2. **Partial Success**: Continues processing even if some chunks fail
3. **Error Visibility**: Logs all failed chunk indices at the end
4. **Graceful Degradation**: Stores chunks without embeddings if all retries fail

## Monitoring

Check logs for:
- ✅ `Successfully generated embeddings for X/Y chunks` - All succeeded
- ⚠️ `Failed to embed Z chunks: [indices]` - Some failed after retries
- 🔄 `Retrying in Xs...` - Retry logic is working

## Testing

To test the improvements:

```bash
# Restart your backend
# Upload a large document (100+ chunks)
# Monitor the logs for smooth batch processing
```

## Troubleshooting

### Still Getting Errors?

1. **Increase Batch Delay**:
   ```bash
   EMBEDDING_BATCH_DELAY=1.0
   ```

2. **Reduce Batch Size**:
   ```bash
   EMBEDDING_BATCH_SIZE=10
   ```

3. **Check Ollama Health**:
   ```bash
   curl http://localhost:11434/api/tags
   ```

4. **Restart Ollama**:
   ```bash
   # Stop Ollama
   # Restart Ollama service
   # Try ingestion again
   ```

5. **Check System Resources**:
   - Ollama may be running out of memory
   - Check CPU/GPU usage during embedding
   - Consider upgrading hardware or using smaller embedding model

## Next Steps

If errors persist:
1. Monitor Ollama logs for crashes
2. Consider using a different embedding model (e.g., `mxbai-embed-large`)
3. Reduce `max_tokens_per_chunk` in config
4. Add connection pooling optimization
