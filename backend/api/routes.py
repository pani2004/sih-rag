"""
API routes for the RAG backend.
"""

import asyncio
import logging
import json
import os
import tempfile
import shutil
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import StreamingResponse, FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from pydantic import BaseModel

from backend.api.schemas import (
    ChatRequest,
    ChatResponse,
    ChatMessage,
    Citation,
    SearchRequest,
    SearchResponse,
    SearchResultItem,
    DocumentListResponse,
    DocumentInfo,
    HealthResponse,
    IngestionRequest,
    IngestionResponse,
    FileUploadResponse
)
from backend.database.connection import get_db_session, db_manager
from backend.database.operations import (
    get_document_count,
    get_chunk_count,
    list_documents,
    create_document,
    create_chunk
)
from backend.core.rag_engine import rag_engine
from backend.core.ollama_client import ollama_client
from backend.config import settings
from backend.ingestion.pipeline import IngestionPipeline
from backend.ingestion.chunker import DoclingHybridChunker, ChunkingConfig
from backend.ingestion.embedder import OllamaEmbedder

try:
    from backend.core.observability import metrics
    METRICS_AVAILABLE = True
except ImportError:
    METRICS_AVAILABLE = False

logger = logging.getLogger(__name__)

# Create router
router = APIRouter()


# ============================================================================
# Health Check
# ============================================================================

@router.get("/health", response_model=HealthResponse, tags=["Health"])
async def health_check(session: AsyncSession = Depends(get_db_session)):
    """
    Check system health status.
    
    Returns status of database, Ollama, and knowledge base statistics.
    """
    try:
        db_healthy = await db_manager.health_check()
        ollama_healthy = await ollama_client.health_check()
        
        # Get knowledge base stats
        doc_count = await get_document_count(session)
        chunk_count = await get_chunk_count(session)
        
        return HealthResponse(
            status="healthy" if (db_healthy and ollama_healthy) else "degraded",
            database="connected" if db_healthy else "disconnected",
            ollama="connected" if ollama_healthy else "disconnected",
            knowledge_base={
                "documents": doc_count,
                "chunks": chunk_count
            },
            model_info={
                "llm_model": settings.ollama_llm_model,
                "embedding_model": settings.ollama_embedding_model,
                "embedding_dimensions": settings.embedding_dimensions,
                "hybrid_search": settings.use_hybrid_search,
                "reranker_enabled": settings.reranker_enabled,
                "reranker_model": settings.reranker_model if settings.reranker_enabled else None
            }
        )
    except Exception as e:
        logger.error(f"Health check failed: {e}", exc_info=True)
        error_detail = {
            "error": "Health check failed",
            "message": str(e),
            "type": type(e).__name__,
            "hint": "Check if database and Ollama services are running"
        }
        raise HTTPException(status_code=503, detail=error_detail)


# ============================================================================
# Chat Endpoints
# ============================================================================

@router.post("/chat", response_model=ChatResponse, tags=["Chat"])
async def chat(
    request: ChatRequest,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Chat with the RAG assistant (non-streaming).
    
    The assistant searches the knowledge base and provides contextual answers.
    """
    try:
        # Convert message history to dict format
        conversation_history = None
        if request.conversation_history:
            conversation_history = [
                {"role": msg.role, "content": msg.content}
                for msg in request.conversation_history
            ]
        
        logger.info("Processing chat request", extra={
            "query_length": len(request.message),
            "has_history": bool(conversation_history)
        })
        
        # Generate response using RAG
        result = await rag_engine.chat(session, request.message, conversation_history)
        
        # Convert back to ChatMessage format
        updated_history = [
            ChatMessage(role=msg["role"], content=msg["content"])
            for msg in result["conversation_history"]
        ]
        
        # Convert citations to Citation objects
        citations = [
            Citation(**citation)
            for citation in result.get("citations", [])
        ]
        
        logger.info("Chat request completed", extra={
            "response_length": len(result["response"]),
            "citations_count": len(citations)
        })
        
        return ChatResponse(
            response=result["response"],
            conversation_history=updated_history,
            citations=citations
        )
        
    except ValueError as e:
        if METRICS_AVAILABLE:
            metrics.rag_requests_total.labels(status="error").inc()
        logger.error(f"Chat validation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Invalid request",
                "message": str(e),
                "type": "ValueError"
            }
        )
    except ConnectionError as e:
        if METRICS_AVAILABLE:
            metrics.rag_requests_total.labels(status="error").inc()
        logger.error(f"Chat connection error: {e}", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Service unavailable",
                "message": "Cannot connect to Ollama service",
                "details": str(e),
                "type": "ConnectionError",
                "hint": "Check if Ollama is running and accessible"
            }
        )
    except Exception as e:
        if METRICS_AVAILABLE:
            metrics.rag_requests_total.labels(status="error").inc()
        logger.error(f"Chat endpoint error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Chat processing failed",
                "message": str(e),
                "type": type(e).__name__,
                "hint": "Check logs for more details"
            }
        )


@router.post("/chat/stream", tags=["Chat"])
async def chat_stream(
    request: ChatRequest,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Chat with the RAG assistant (streaming).
    
    Returns server-sent events with response chunks.
    Each request is processed independently with its own async context.
    """
    import asyncio
    
    async def generate():
        # Get unique request identifier for logging
        request_id = id(asyncio.current_task())
        logger.info(f"[Request {request_id}] Starting chat stream for message: {request.message[:50]}...")
        
        import time
        start_time = time.time()
        
        try:
            # Convert message history
            conversation_history = None
            if request.conversation_history:
                conversation_history = [
                    {"role": msg.role, "content": msg.content}
                    for msg in request.conversation_history
                ]
            
            # Search knowledge base for citations
            search_status = json.dumps({'status': 'searching'})
            yield f"data: {search_status}\n\n"
            search_start = time.time()
            search_results = await rag_engine.search(session, request.message)
            search_time = time.time() - search_start
            
            # Build citations
            citations = []
            for i, result in enumerate(search_results, 1):
                citations.append({
                    "number": i,
                    "chunk_id": str(result.chunk_id),
                    "document_id": str(result.document_id),
                    "document_title": result.document_title,
                    "document_source": result.document_source,
                    "content": result.content,
                    "metadata": result.chunk_metadata,
                    "similarity": result.similarity
                })
            
            # Send citations with search time
            citations_data = json.dumps({'status': 'citations', 'citations': citations, 'thinkingTime': round(search_time, 2)})
            yield f"data: {citations_data}\n\n"
            
            # Stream response (pass search_results to avoid duplicate search)
            generation_start = time.time()
            generating_status = json.dumps({'status': 'generating'})
            yield f"data: {generating_status}\n\n"
            
            full_response = ""
            async for chunk in rag_engine.generate_answer_stream(
                session,
                request.message,
                conversation_history,
                search_results  # Reuse already-fetched results
            ):
                full_response += chunk
                chunk_data = json.dumps({'chunk': chunk})
                yield f"data: {chunk_data}\n\n"
            
            generation_time = time.time() - generation_start
            total_time = time.time() - start_time
            
            # Send completion event with timing
            done_data = json.dumps({'status': 'done', 'response': full_response, 'responseTime': round(generation_time, 2), 'totalTime': round(total_time, 2)})
            yield f"data: {done_data}\n\n"
            
            logger.info(f"[Request {request_id}] Completed successfully")
            
            # Record success metric
            if METRICS_AVAILABLE:
                metrics.rag_requests_total.labels(status="success").inc()
            
        except Exception as e:
            if METRICS_AVAILABLE:
                metrics.rag_requests_total.labels(status="error").inc()
            logger.error(f"[Request {request_id}] Streaming error: {e}", exc_info=True)
            error_data = json.dumps({'error': str(e)})
            yield f"data: {error_data}\n\n"
    
    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        }
    )


# ============================================================================
# Search Endpoint
# ============================================================================

@router.post("/search", response_model=SearchResponse, tags=["Search"])
async def search(
    request: SearchRequest,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Search the knowledge base using semantic similarity.
    
    Returns relevant chunks with similarity scores.
    """
    try:
        results = await rag_engine.search(session, request.query, request.limit)
        
        items = [
            SearchResultItem(
                chunk_id=str(r.chunk_id),
                document_id=str(r.document_id),
                content=r.content,
                similarity=r.similarity,
                metadata=r.chunk_metadata,
                document_title=r.document_title,
                document_source=r.document_source
            )
            for r in results
        ]
        
        return SearchResponse(
            results=items,
            total_results=len(items)
        )
        
    except ValueError as e:
        logger.error(f"Search validation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Invalid search query",
                "message": str(e),
                "type": "ValueError"
            }
        )
    except ConnectionError as e:
        logger.error(f"Search connection error: {e}", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Embedding service unavailable",
                "message": "Cannot connect to Ollama for embeddings",
                "details": str(e),
                "type": "ConnectionError"
            }
        )
    except Exception as e:
        logger.error(f"Search endpoint error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Search failed",
                "message": str(e),
                "type": type(e).__name__,
                "hint": "Ensure knowledge base is populated and Ollama is running"
            }
        )


# ============================================================================
# Document Management Endpoints
# ============================================================================

@router.get("/documents", response_model=DocumentListResponse, tags=["Documents"])
async def get_documents(
    limit: int = 100,
    offset: int = 0,
    session: AsyncSession = Depends(get_db_session)
):
    """
    List all documents in the knowledge base.
    
    Supports pagination with limit and offset parameters.
    """
    try:
        documents = await list_documents(session, limit=limit, offset=offset)
        total = await get_document_count(session)
        
        doc_infos = [
            DocumentInfo(
                id=str(doc.id),
                title=doc.title,
                source=doc.source,
                metadata=doc.metadata_,
                created_at=doc.created_at,
                updated_at=doc.updated_at
            )
            for doc in documents
        ]
        
        return DocumentListResponse(
            documents=doc_infos,
            total=total
        )
        
    except Exception as e:
        logger.error(f"List documents error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to list documents",
                "message": str(e),
                "type": type(e).__name__,
                "hint": "Check database connection"
            }
        )


@router.get("/documents/{document_id}/file", tags=["Documents"])
async def get_document_file(
    document_id: str,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Serve the actual document file for viewing/downloading.
    
    Supports PDFs and other document types stored in local storage.
    """
    try:
        from backend.database.operations import get_document_by_id
        
        # Get document metadata from database
        document = await get_document_by_id(session, document_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Check storage directory
        storage_dir = Path(settings.documents_storage_dir)
        storage_dir.mkdir(parents=True, exist_ok=True)
        
        # Look for file in storage
        # Try both the original source and stored filename
        possible_paths = [
            storage_dir / document.source,
            storage_dir / Path(document.source).name,
            Path(document.source) if Path(document.source).exists() else None
        ]
        
        file_path = None
        for path in possible_paths:
            if path and path.exists() and path.is_file():
                file_path = path
                break
        
        if not file_path:
            raise HTTPException(
                status_code=404,
                detail=f"Document file not found in storage: {document.source}"
            )
        
        # Determine media type
        suffix = file_path.suffix.lower()
        media_types = {
            '.pdf': 'application/pdf',
            '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
            '.doc': 'application/msword',
            '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
            '.ppt': 'application/vnd.ms-powerpoint',
            '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            '.xls': 'application/vnd.ms-excel',
            '.txt': 'text/plain',
            '.md': 'text/markdown',
            '.mp3': 'audio/mpeg',
            '.wav': 'audio/wav',
            '.m4a': 'audio/mp4',
            '.flac': 'audio/flac',
        }
        media_type = media_types.get(suffix, 'application/octet-stream')
        
        logger.info(f"Serving document file: {file_path} ({media_type})")
        
        return FileResponse(
            path=str(file_path),
            media_type=media_type,
            filename=file_path.name
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error serving document file: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to serve document file",
                "message": str(e),
                "type": type(e).__name__
            }
        )


# ============================================================================
# Ingestion Endpoint
# ============================================================================

@router.post("/ingest", response_model=IngestionResponse, tags=["Documents"])
async def ingest_documents(
    request: IngestionRequest,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Ingest documents from the documents folder.
    
    Processes all supported files (PDF, Word, Excel, PowerPoint, Markdown, Audio)
    and stores them in the knowledge base with embeddings.
    """
    try:
        # Run ingestion in background (non-blocking)
        pipeline = IngestionPipeline(
            documents_folder=request.documents_path or "documents",
            clean_before_ingest=request.clean_existing
        )
        
        # Run the pipeline
        logger.info(f"Starting ingestion from {request.documents_path or 'documents'}")
        result = await pipeline.run()
        
        return IngestionResponse(
            status="completed" if result["success"] else "failed",
            message=result.get("message", "Ingestion completed"),
            documents_processed=result.get("documents_processed", 0),
            chunks_created=result.get("chunks_created", 0),
            errors=result.get("errors", [])
        )
        
    except FileNotFoundError as e:
        logger.error(f"Ingestion path error: {e}", exc_info=True)
        raise HTTPException(
            status_code=404,
            detail={
                "error": "Documents path not found",
                "message": str(e),
                "type": "FileNotFoundError",
                "hint": f"Check if path exists: {request.documents_path}"
            }
        )
    except PermissionError as e:
        logger.error(f"Ingestion permission error: {e}", exc_info=True)
        raise HTTPException(
            status_code=403,
            detail={
                "error": "Permission denied",
                "message": str(e),
                "type": "PermissionError",
                "hint": "Check file/folder permissions"
            }
        )
    except Exception as e:
        logger.error(f"Ingestion endpoint error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Ingestion failed",
                "message": str(e),
                "type": type(e).__name__,
                "hint": "Check logs for detailed error information"
            }
        )


class IngestByIdRequest(BaseModel):
    document_id: str  # UUID as string

@router.post("/ingest-by-id", tags=["Documents"])
async def ingest_document_by_id(
    request: IngestByIdRequest,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Ingest a single document by its database ID (UUID).
    Used by Inngest background processing to avoid re-processing existing docs.
    """
    from uuid import UUID
    from sqlalchemy import select
    from backend.database.models import Document
    from backend.database.operations import count_chunks_for_document
    
    # Convert string ID to UUID
    try:
        document_uuid = UUID(request.document_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid document ID format")
    
    # Get document from database
    result = await session.execute(
        select(Document).where(Document.id == document_uuid)
    )
    doc = result.scalar_one_or_none()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    
    # Check if already processed
    chunk_count = await count_chunks_for_document(session, str(document_uuid))
    if chunk_count > 0:
        logger.info(f"Document {document_uuid} already has {chunk_count} chunks, skipping")
        return {"status": "skipped", "message": "Document already processed", "chunks": chunk_count}
    
    # Process the document
    file_path = doc.metadata_.get("file_path") or os.path.join(settings.documents_storage_dir, doc.source)
    if not os.path.exists(file_path):
        logger.error(f"File not found: {file_path}")
        raise HTTPException(status_code=404, detail=f"Document file not found on disk: {file_path}")
    
    try:
        logger.info(f"="*80)
        logger.info(f"STARTING DOCUMENT PROCESSING")
        logger.info(f"Document ID: {document_uuid}")
        logger.info(f"File: {doc.source}")
        logger.info(f"="*80)
        
        config = ChunkingConfig(max_tokens=settings.max_tokens_per_chunk)
        chunker = DoclingHybridChunker(config)
        embedder = OllamaEmbedder()
        pipeline = IngestionPipeline(documents_folder="", clean_before_ingest=False)
        
        # Read and process
        logger.info(f"[1/4] Reading document {document_uuid}...")
        content_text, docling_doc = pipeline._read_document(file_path)
        title = pipeline._extract_title(content_text, file_path)
        
        logger.info(f"✓ Document read successfully")
        logger.info(f"  - Title: {title}")
        logger.info(f"  - Content length: {len(content_text)} characters")
        
        # Log content preview to verify extraction
        content_preview = content_text[:500].replace('\n', ' ')[:200]
        logger.info(f"  - Content preview: {content_preview}...")
        
        # Check if docling_doc is valid
        if docling_doc:
            logger.info(f"  - DoclingDocument available: Yes")
        else:
            logger.warning(f"  - DoclingDocument available: No (will use fallback)")
        
        logger.info(f"[2/4] Chunking document: {title}...")
        chunks = await chunker.chunk_document(
            content=content_text,
            title=title,
            source=doc.source,
            metadata={"document_id": str(document_uuid)},
            docling_doc=docling_doc
        )
        
        total_chunks = len(chunks)
        logger.info(f"✓ Chunking completed: {total_chunks} chunks created")
        
        # Debug: Log first chunk if only 1 chunk created
        if total_chunks == 1:
            logger.warning(f"⚠️  ONLY 1 CHUNK CREATED!")
            logger.warning(f"  - This usually means content extraction failed")
            logger.warning(f"  - First chunk preview: {chunks[0].content[:200]}...")
            logger.warning(f"  - Chunk token count: {chunks[0].token_count}")
        logger.info(f"")
        logger.info(f"[3/4] Generating embeddings in parallel...")
        
        # Calculate optimal concurrency based on chunk count
        import math
        
        # For large documents (300+ pages typically = 600+ chunks), use aggressive parallelization
        if total_chunks > 500:
            # Large document: Use maximum parallelization
            max_concurrent = 50
            logger.info(f"📄 LARGE DOCUMENT DETECTED: {total_chunks} chunks")
            logger.info(f"⚡ Using MAXIMUM PARALLELIZATION: 50 concurrent requests")
            logger.info(f"⏱️  Estimated processing time: 5-10 minutes")
        elif total_chunks > 200:
            # Medium-large document: Use high parallelization
            max_concurrent = 40
            logger.info(f"📄 Medium-large document: {total_chunks} chunks")
            logger.info(f"⚡ Using high parallelization: 40 concurrent requests")
            logger.info(f"⏱️  Estimated processing time: 3-5 minutes")
        elif total_chunks > 100:
            # Medium document: Use moderate parallelization
            max_concurrent = 30
        else:
            # Small document: Use standard parallelization
            max_concurrent = min(20, max(10, math.ceil(total_chunks / 20)))
        
        # Generate embeddings with parallel processing
        embedded_chunks = await embedder.embed_chunks(
            chunks,
            progress_callback=lambda curr, total, pct: logger.info(
                f"Embedding progress: {curr}/{total} batches ({pct}%)",
                extra={"document_id": str(document_uuid), "progress": pct}
            ),
            max_concurrent=max_concurrent
        )
        
        logger.info(f"✓ Embeddings generated successfully")
        logger.info(f"")
        logger.info(f"[4/4] Storing {len(embedded_chunks)} chunks in database...")
        chunk_count = 0
        
        # Adaptive batch insert size based on document size
        if len(embedded_chunks) > 500:
            batch_insert_size = 50  # Large documents: bigger batches
        elif len(embedded_chunks) > 200:
            batch_insert_size = 40  # Medium documents
        else:
            batch_insert_size = 25  # Small documents
        for batch_idx in range(0, len(embedded_chunks), batch_insert_size):
            batch = embedded_chunks[batch_idx:batch_idx + batch_insert_size]
            for chunk in batch:
                await create_chunk(
                    session,
                    document_id=document_uuid,
                    content=chunk.content,
                    embedding=chunk.embedding,
                    chunk_index=chunk.index,
                    token_count=chunk.token_count,
                    metadata=chunk.metadata
                )
                chunk_count += 1
            # Commit in batches
            await session.flush()
            logger.info(f"Stored {min(batch_idx + batch_insert_size, len(embedded_chunks))}/{len(embedded_chunks)} chunks")
        
        # Update document status
        doc.chunk_count = chunk_count
        await session.commit()
        
        logger.info(f"✓ Database storage completed")
        logger.info(f"")
        logger.info(f"="*80)
        logger.info(f"🎉 DOCUMENT PROCESSING COMPLETED SUCCESSFULLY")
        logger.info(f"  📊 Summary:")
        logger.info(f"     • Document: {title}")
        logger.info(f"     • Total chunks: {chunk_count}")
        logger.info(f"     • Embeddings: {chunk_count}")
        logger.info(f"     • Status: Ready for queries ✅")
        logger.info(f"="*80)
        
        return {"status": "completed", "message": "Document processed", "chunks_created": chunk_count}
        
    except Exception as e:
        logger.error(f"Failed to process document {document_id}: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/documents/{document_id}", tags=["Documents"])
async def delete_document_endpoint(
    document_id: str,
    session: AsyncSession = Depends(get_db_session)
):
    """
    Delete a document and all its chunks and embeddings.
    
    Args:
        document_id: Document UUID as string
        
    Returns:
        Success message
    """
    from uuid import UUID
    from backend.database.operations import delete_document, get_document_by_id
    
    try:
        # Convert string ID to UUID
        try:
            document_uuid = UUID(document_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid document ID format")
        
        # Check if document exists
        document = await get_document_by_id(session, document_id)
        if not document:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Delete document file from storage if it exists
        storage_dir = Path(settings.documents_storage_dir)
        file_path = storage_dir / Path(document.source).name
        if file_path.exists():
            try:
                file_path.unlink()
                logger.info(f"Deleted file from storage: {file_path}")
            except Exception as e:
                logger.warning(f"Failed to delete file from storage: {e}")
        
        # Delete from database (cascades to chunks)
        deleted = await delete_document(session, document_uuid)
        await session.commit()
        
        if deleted:
            logger.info(f"Deleted document {document_uuid} and all its chunks")
            return {
                "status": "success",
                "message": f"Document '{document.title}' and all its chunks deleted successfully"
            }
        else:
            raise HTTPException(status_code=404, detail="Document not found")
            
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting document: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "Failed to delete document",
                "message": str(e),
                "type": type(e).__name__
            }
        )


@router.post("/upload", response_model=FileUploadResponse, tags=["Documents"])
async def upload_file(
    file: UploadFile = File(..., description="File to upload (PDF, DOCX, PPTX, XLSX, MD, TXT, MP3, WAV, M4A, FLAC)")
):
    """
    Upload a single file and ingest it into the knowledge base.
    
    Supports: PDF, DOCX, PPTX, XLSX, MD, TXT, MP3, WAV, M4A, FLAC
    """
    # Validate file extension
    supported_extensions = {
        '.pdf', '.docx', '.pptx', '.xlsx', '.xls',
        '.md', '.txt', '.mp3', '.wav', '.m4a', '.flac'
    }
    
    file_ext = os.path.splitext(file.filename)[1].lower()
    if file_ext not in supported_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type: {file_ext}. Supported: {', '.join(supported_extensions)}"
        )
    
    try:
        # Save uploaded file to permanent storage only
        storage_dir = Path(settings.documents_storage_dir)
        storage_dir.mkdir(parents=True, exist_ok=True)
        storage_path = storage_dir / file.filename
        
        content = await file.read()
        with open(storage_path, 'wb') as f:
            f.write(content)
        
        logger.info(f"Saved file to storage: {storage_path}")
        
        # Create document record in database WITHOUT processing
        # Processing will be done by Inngest in the background
        async with db_manager.get_session() as session:
            document = await create_document(
                session,
                title=file.filename,  # Will be updated after processing
                source=file.filename,
                content="",  # Will be filled during processing
                metadata={
                    "uploaded": True,
                    "original_filename": file.filename,
                    "processed": False,
                    "file_path": str(storage_path)  # Store file path in metadata
                }
            )
            await session.commit()
            document_id = document.id
        
        logger.info(f"Created document record {document_id} for {file.filename}. Processing will happen in background.")
        
        return FileUploadResponse(
            status="success",
            message=f"File '{file.filename}' uploaded successfully. Processing in background...",
            document_id=str(document_id),
            chunks_created=0,  # Will be filled after processing
            filename=file.filename
        )
        
    except FileNotFoundError as e:
        if 'tmp_file_path' in locals() and os.path.exists(tmp_file_path):
            os.unlink(tmp_file_path)
        logger.error(f"File upload - file not found: {e}", exc_info=True)
        raise HTTPException(
            status_code=404,
            detail={
                "error": "File processing failed",
                "message": "Temporary file was lost during processing",
                "details": str(e),
                "type": "FileNotFoundError"
            }
        )
    except ValueError as e:
        if 'tmp_file_path' in locals() and os.path.exists(tmp_file_path):
            os.unlink(tmp_file_path)
        logger.error(f"File upload - validation error: {e}", exc_info=True)
        raise HTTPException(
            status_code=400,
            detail={
                "error": "Invalid file content",
                "message": str(e),
                "type": "ValueError",
                "hint": "File may be corrupted or in an unsupported format"
            }
        )
    except ConnectionError as e:
        if 'tmp_file_path' in locals() and os.path.exists(tmp_file_path):
            os.unlink(tmp_file_path)
        logger.error(f"File upload - connection error: {e}", exc_info=True)
        raise HTTPException(
            status_code=503,
            detail={
                "error": "Service unavailable",
                "message": "Cannot connect to Ollama for embeddings",
                "details": str(e),
                "type": "ConnectionError",
                "hint": "Ensure Ollama is running and accessible"
            }
        )
    except Exception as e:
        if 'tmp_file_path' in locals() and os.path.exists(tmp_file_path):
            os.unlink(tmp_file_path)
        logger.error(f"File upload error: {e}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail={
                "error": "File processing failed",
                "message": str(e),
                "type": type(e).__name__,
                "filename": file.filename,
                "hint": "Check if file is valid and Ollama service is running"
            }
        )
