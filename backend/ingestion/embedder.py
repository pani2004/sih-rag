"""
Document embedding generation using Ollama.
"""

import logging
import asyncio
from typing import List

from backend.core.ollama_client import ollama_client
from backend.ingestion.chunker import DocumentChunk

logger = logging.getLogger(__name__)


class OllamaEmbedder:
    """Generates embeddings for document chunks using Ollama."""
    
    def __init__(self, batch_size: int = 50):
        """
        Initialize embedder.
        
        Args:
            batch_size: Number of chunks to process at a time
        """
        self.ollama = ollama_client
        self.batch_size = batch_size
    
    async def embed_chunk(self, chunk: DocumentChunk) -> DocumentChunk:
        """
        Generate embedding for a single chunk.
        
        Args:
            chunk: Document chunk to embed
            
        Returns:
            Chunk with embedding added
        """
        embedding = await self.ollama.generate_embedding(chunk.content)
        chunk.embedding = embedding
        return chunk
    
    async def embed_chunks(
        self,
        chunks: List[DocumentChunk],
        progress_callback=None,
        batch_delay: float = 0.1,
        max_concurrent: int = 20
    ) -> List[DocumentChunk]:
        """
        Generate embeddings for multiple chunks with parallel processing.
        
        Args:
            chunks: List of document chunks
            progress_callback: Optional callback(current, total, percentage) for progress updates
            batch_delay: Delay in seconds between batches
            max_concurrent: Maximum number of concurrent embedding requests
            
        Returns:
            Chunks with embeddings added
        """
        if not chunks:
            return chunks
        
        total_chunks = len(chunks)
        logger.info(f"Generating embeddings for {total_chunks} chunks with {max_concurrent} concurrent requests...")
        
        # Calculate optimal batch size and delay based on document size
        import math
        num_batches = max(1, math.ceil(total_chunks / max_concurrent))
        batch_size = math.ceil(total_chunks / num_batches)
        
        # Adjust batch delay dynamically - less delay for larger documents
        if total_chunks > 500:
            batch_delay = 0.05  # Large documents (300+ pages): minimal delay
            logger.info(f"Large document: processing {total_chunks} chunks in {num_batches} parallel batches of ~{batch_size} each (minimal delay)")
        elif total_chunks > 200:
            batch_delay = 0.1  # Medium documents: reduced delay  
            logger.info(f"Medium document: processing {total_chunks} chunks in {num_batches} parallel batches of ~{batch_size} each")
        else:
            logger.info(f"Processing {total_chunks} chunks in {num_batches} parallel batches of ~{batch_size} each")
        
        embedded_chunks = [None] * len(chunks)  # Pre-allocate to maintain order
        failed_chunks = []
        completed = 0
        
        # Process in parallel batches
        for batch_idx in range(0, len(chunks), batch_size):
            batch = chunks[batch_idx:batch_idx + batch_size]
            current_batch_num = (batch_idx // batch_size) + 1
            
            # Process entire batch concurrently
            tasks = []
            for chunk in batch:
                tasks.append(self._embed_with_retry(chunk))
            
            # Wait for all tasks in batch to complete
            results = await asyncio.gather(*tasks, return_exceptions=True)
            
            # Process results
            for idx, (chunk, result) in enumerate(zip(batch, results)):
                global_idx = batch_idx + idx
                if isinstance(result, Exception):
                    logger.error(f"Failed to embed chunk {chunk.index}: {result}")
                    failed_chunks.append(chunk.index)
                    embedded_chunks[global_idx] = chunk  # Add without embedding
                else:
                    embedded_chunks[global_idx] = result
                
                completed += 1
                
            # Progress update
            percentage = int((completed / total_chunks) * 100)
            logger.info(f"Embedding progress: {completed}/{total_chunks} chunks ({percentage}%)")
            
            if progress_callback:
                progress_callback(current_batch_num, num_batches, percentage)
            
            # Small delay between batches
            if batch_idx + batch_size < len(chunks):
                await asyncio.sleep(batch_delay)
        
        if failed_chunks:
            logger.warning(f"Failed to embed {len(failed_chunks)} chunks: {failed_chunks[:10]}...")
        
        logger.info(
            f"Successfully generated embeddings for {len(embedded_chunks) - len(failed_chunks)}/{len(chunks)} chunks"
        )
        return embedded_chunks
    
    async def _embed_with_retry(self, chunk: DocumentChunk, max_retries: int = 3) -> DocumentChunk:
        """
        Embed a chunk with retry logic.
        
        Args:
            chunk: Chunk to embed
            max_retries: Maximum retry attempts
            
        Returns:
            Embedded chunk
        """
        for attempt in range(max_retries):
            try:
                return await self.embed_chunk(chunk)
            except Exception as e:
                if attempt == max_retries - 1:
                    raise
                await asyncio.sleep(0.5 * (attempt + 1))  # Exponential backoff
        return chunk
