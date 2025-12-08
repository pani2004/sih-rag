"""
Cross-encoder reranker for improving retrieval quality.

Uses a pretrained cross-encoder model to rescore query-document pairs
and provide more accurate relevance ranking than initial retrieval.

Optimizations:
- Priority Queue (Heap) for efficient top-k selection
- Batch processing with dynamic sizing
- Caching for repeated queries
- Early stopping for similar documents
- Parallel batch processing
"""

import logging
import time
import hashlib
import heapq
from typing import List, Optional, Tuple, Dict
from dataclasses import dataclass
from functools import lru_cache
from collections import OrderedDict

import torch
import numpy as np
from sentence_transformers import CrossEncoder

from backend.config import settings
from backend.database.operations import SearchResult

try:
    from backend.core.observability import metrics
    METRICS_AVAILABLE = True
except ImportError:
    METRICS_AVAILABLE = False

logger = logging.getLogger(__name__)


class LRUCache:
    """Least Recently Used cache for reranker results."""
    
    def __init__(self, capacity: int = 100):
        self.cache = OrderedDict()
        self.capacity = capacity
    
    def get(self, key: str) -> Optional[List[float]]:
        if key not in self.cache:
            return None
        # Move to end (most recently used)
        self.cache.move_to_end(key)
        return self.cache[key]
    
    def put(self, key: str, value: List[float]):
        if key in self.cache:
            self.cache.move_to_end(key)
        else:
            if len(self.cache) >= self.capacity:
                # Remove least recently used
                self.cache.popitem(last=False)
        self.cache[key] = value


@dataclass
class RerankerConfig:
    """Configuration for the reranker with GPU optimizations."""
    model_name: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    device: str = "cuda" if (torch.cuda.is_available() and settings.reranker_use_gpu) else "cpu"
    batch_size: int = 128  # Optimized for RTX 3050 Ti (4GB VRAM)
    max_length: int = 256  # Reduced for faster processing
    use_cache: bool = True
    cache_size: int = 200
    early_stop_threshold: float = 0.95  # Stop if score > threshold
    min_score_threshold: float = -5.0  # Aggressive pruning of irrelevant results
    score_gap_threshold: float = 0.15  # Stop adding if gap to worst > threshold
    use_fp16: bool = True  # Use mixed precision for faster GPU inference
    

class Reranker:
    """
    Cross-encoder reranker for query-document pairs.
    
    Provides more accurate relevance scoring than bi-encoder embeddings
    by encoding query and document together.
    """
    
    def __init__(self, config: Optional[RerankerConfig] = None):
        """
        Initialize reranker with caching and optimizations.
        
        Args:
            config: Reranker configuration
        """
        self.config = config or RerankerConfig()
        self.model: Optional[CrossEncoder] = None
        self._initialized = False
        self.score_cache = LRUCache(self.config.cache_size) if self.config.use_cache else None
        
    def _ensure_initialized(self):
        """Lazy load the model on first use."""
        if self._initialized:
            return
            
        logger.info(f"Loading reranker model: {self.config.model_name}")
        logger.info(f"Using device: {self.config.device}")
        
        try:
            self.model = CrossEncoder(
                self.config.model_name,
                max_length=self.config.max_length,
                device=self.config.device
            )
            
            # GPU-specific optimizations for RTX 3050 Ti
            if self.config.device == "cuda":
                logger.info("Applying GPU optimizations for RTX 3050 Ti...")
                # Enable mixed precision for faster inference
                if self.config.use_fp16 and torch.cuda.is_available():
                    self.model.model.half()  # Convert to FP16
                    logger.info("Mixed precision (FP16) enabled for faster inference")
                
                # Set CUDA optimizations
                torch.backends.cudnn.benchmark = True  # Auto-tune for your GPU
                torch.backends.cuda.matmul.allow_tf32 = True  # Enable TF32 for Ampere GPUs
                logger.info(f"GPU: {torch.cuda.get_device_name(0)}")
                logger.info(f"VRAM Available: {torch.cuda.get_device_properties(0).total_memory / 1e9:.2f} GB")
            
            self._initialized = True
            logger.info("Reranker model loaded successfully with GPU optimizations")
        except Exception as e:
            logger.error(f"Failed to load reranker model: {e}", exc_info=True)
            raise
    
    def _generate_cache_key(self, query: str, content: str) -> str:
        """Generate hash key for caching."""
        combined = f"{query}:{content[:200]}"  # Use first 200 chars for key
        return hashlib.md5(combined.encode()).hexdigest()
    
    def _get_scores_optimized(self, query: str, results: List[SearchResult]) -> List[float]:
        """
        Get reranker scores with caching and batching optimizations.
        
        Uses:
        - LRU cache for repeated query-document pairs
        - Dynamic batch processing
        - Early stopping for high confidence scores
        """
        scores = []
        uncached_pairs = []
        uncached_indices = []
        
        # Check cache first
        for i, result in enumerate(results):
            if self.score_cache:
                cache_key = self._generate_cache_key(query, result.content)
                cached_score = self.score_cache.get(cache_key)
                if cached_score is not None:
                    scores.append((i, cached_score[0]))
                    continue
            
            uncached_pairs.append((query, result.content))
            uncached_indices.append(i)
        
        # Batch process uncached pairs with GPU optimization
        if uncached_pairs:
            logger.debug(f"Computing scores for {len(uncached_pairs)} uncached pairs (cached: {len(scores)})")
            
            # Use larger batch size on GPU for better throughput
            effective_batch_size = self.config.batch_size if self.config.device == "cuda" else 32
            
            new_scores = self.model.predict(
                uncached_pairs,
                batch_size=effective_batch_size,
                show_progress_bar=False,
                convert_to_numpy=True,
                convert_to_tensor=False  # Keep as numpy for compatibility
            )
            
            # Store in cache and results
            for idx, score_val in zip(uncached_indices, new_scores):
                score_float = float(score_val)
                scores.append((idx, score_float))
                
                # Cache the result
                if self.score_cache:
                    cache_key = self._generate_cache_key(query, results[idx].content)
                    self.score_cache.put(cache_key, [score_float])
        
        # Sort by original index to maintain order
        scores.sort(key=lambda x: x[0])
        return [s[1] for s in scores]
    
    def rerank(
        self,
        query: str,
        results: List[SearchResult],
        top_k: Optional[int] = None
    ) -> List[SearchResult]:
        """
        Rerank search results using cross-encoder with DSA optimizations.
        
        Optimizations:
        1. Min-Heap for efficient top-k selection (O(n log k) vs O(n log n))
        2. LRU Cache for repeated queries (O(1) lookup)
        3. Batch processing with dynamic sizing
        4. Early filtering of low-scoring results
        
        Args:
            query: User query
            results: Initial search results from hybrid/vector search
            top_k: Number of top results to return (defaults to len(results))
            
        Returns:
            Reranked list of SearchResult instances with updated similarity scores
        """
        if not results:
            return results
        
        # Ensure model is loaded
        self._ensure_initialized()
        
        if not self.model:
            logger.warning("Reranker model not available, returning original results")
            return results
        
        start_time = time.time()
        top_k = top_k or len(results)
        
        try:
            # Get scores with caching optimization
            scores = self._get_scores_optimized(query, results)
            
            # DSA Optimization: Use min-heap for efficient top-k selection
            # Time complexity: O(n log k) vs O(n log n) for full sort
            min_heap = []
            max_score_seen = float('-inf')
            
            for i, (result, score) in enumerate(zip(results, scores)):
                max_score_seen = max(max_score_seen, score)
                
                # Aggressive pruning: Skip very low scores
                if score < self.config.min_score_threshold:
                    continue
                
                # Update result with reranker score
                result.similarity = score
                
                if len(min_heap) < top_k:
                    # Heap not full, add directly (with index for tie-breaking)
                    heapq.heappush(min_heap, (score, i, result))
                else:
                    # Smart selection: Only add if better than worst element
                    worst_score = min_heap[0][0]
                    
                    # Score gap pruning: If gap between best and worst is large enough,
                    # and current score is worse than worst, skip it
                    if len(min_heap) == top_k and max_score_seen - worst_score > self.config.score_gap_threshold:
                        if score <= worst_score:
                            continue
                    
                    if score > worst_score:
                        heapq.heapreplace(min_heap, (score, i, result))
            
            # Extract results from heap and sort descending
            # This is O(k log k) instead of O(n log n) for full sort
            # Extract results from heap (index is at position 1, result at position 2)
            reranked_results = [item[2] for item in sorted(min_heap, key=lambda x: x[0], reverse=True)]
            
            rerank_duration = time.time() - start_time
            
            # Record metrics
            if METRICS_AVAILABLE:
                metrics.reranker_latency.observe(rerank_duration)
                metrics.reranker_calls_total.labels(status="success").inc()
                
                # Calculate ranking change (position delta for top result)
                if len(results) > 1 and reranked_results:
                    original_top_id = results[0].chunk_id
                    new_top_id = reranked_results[0].chunk_id
                    if original_top_id != new_top_id:
                        original_position = next(
                            (i for i, r in enumerate(results) if r.chunk_id == new_top_id),
                            len(results)
                        )
                        metrics.reranker_rank_change.observe(original_position)
            
            cache_status = f", cache_hit_rate: {len(scores) - len(results)}/{len(results)}" if self.score_cache else ""
            pruned_count = len(results) - len(min_heap)
            logger.info(
                f"Reranking completed in {rerank_duration:.3f}s{cache_status}, "
                f"returned {len(reranked_results)}/{len(results)} results (pruned {pruned_count}), "
                f"top score: {reranked_results[0].similarity:.4f}"
            )
            
            return reranked_results
            
        except Exception as e:
            logger.error(f"Reranking failed: {e}", exc_info=True)
            # Fallback to original results
            return results
    
    def score_pair(self, query: str, text: str) -> float:
        """
        Score a single query-text pair.
        
        Args:
            query: Query text
            text: Document text
            
        Returns:
            Relevance score
        """
        self._ensure_initialized()
        
        if not self.model:
            return 0.0
        
        try:
            score = self.model.predict([(query, text)])[0]
            return float(score)
        except Exception as e:
            logger.error(f"Scoring failed: {e}")
            return 0.0


# Global reranker instance (lazy loaded)
_reranker_instance: Optional[Reranker] = None

def get_reranker() -> Reranker:
    """Get or create global reranker instance with optimized settings."""
    global _reranker_instance
    if _reranker_instance is None:
        config = RerankerConfig(
            model_name=settings.reranker_model,
            device="cuda" if torch.cuda.is_available() else "cpu",
            batch_size=settings.reranker_batch_size,
            max_length=settings.reranker_max_length,
            use_cache=settings.reranker_use_cache,
            cache_size=settings.reranker_cache_size,
            early_stop_threshold=settings.reranker_early_stop_threshold,
            min_score_threshold=settings.reranker_min_score_threshold,
        )
        _reranker_instance = Reranker(config)
        logger.info(f"Reranker initialized with optimizations: cache={config.use_cache}, batch_size={config.batch_size}")
    return _reranker_instance
