"""
Test script to verify backend handles concurrent streaming requests.
Run this while backend is running to check if requests are truly concurrent.
"""

import asyncio
import httpx
import time
from datetime import datetime

API_URL = "http://localhost:8000/chat/stream"

async def send_chat_request(message: str, request_num: int):
    """Send a chat request and measure timing."""
    start_time = time.time()
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Request {request_num} STARTED: {message}")
    
    async with httpx.AsyncClient(timeout=120.0) as client:
        async with client.stream(
            "POST",
            API_URL,
            json={"message": message, "conversation_history": []},
        ) as response:
            chunks_received = 0
            first_chunk_time = None
            
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    chunks_received += 1
                    if first_chunk_time is None:
                        first_chunk_time = time.time()
                        print(f"[{datetime.now().strftime('%H:%M:%S')}] Request {request_num} FIRST CHUNK (after {first_chunk_time - start_time:.2f}s)")
    
    end_time = time.time()
    total_time = end_time - start_time
    print(f"[{datetime.now().strftime('%H:%M:%S')}] Request {request_num} COMPLETED in {total_time:.2f}s ({chunks_received} chunks)")
    return total_time

async def test_concurrent_requests():
    """Test 2 concurrent requests."""
    print("=" * 80)
    print("TESTING CONCURRENT STREAMING REQUESTS")
    print("=" * 80)
    print()
    
    # Start both requests simultaneously
    task1 = asyncio.create_task(send_chat_request("What is Kubernetes?", 1))
    task2 = asyncio.create_task(send_chat_request("Explain Docker containers", 2))
    
    # Wait for both to complete
    times = await asyncio.gather(task1, task2)
    
    print()
    print("=" * 80)
    print("RESULTS:")
    print(f"Request 1 took: {times[0]:.2f}s")
    print(f"Request 2 took: {times[1]:.2f}s")
    print()
    
    # If they run concurrently, times should be similar
    # If they run sequentially, second request should take ~2x the first
    time_diff = abs(times[0] - times[1])
    avg_time = (times[0] + times[1]) / 2
    
    if time_diff < avg_time * 0.3:  # Within 30% of each other
        print("✅ CONCURRENT: Requests completed at similar times (running in parallel)")
    else:
        print("❌ SEQUENTIAL: Large time difference detected (likely queued)")
        print(f"   This is normal - Ollama processes one request at a time by design")
    
    print("=" * 80)

if __name__ == "__main__":
    asyncio.run(test_concurrent_requests())
