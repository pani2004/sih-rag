"""
Document ingestion pipeline for the RAG system.
Processes documents, chunks them, generates embeddings, and stores in database.
"""

import argparse
import asyncio
import glob
import logging
import os
from datetime import datetime
from pathlib import Path
from typing import List, Optional, Dict, Any

from sqlalchemy.ext.asyncio import AsyncSession
from docling.document_converter import DocumentConverter, AudioFormatOption, PdfFormatOption
from docling.datamodel.pipeline_options import AsrPipelineOptions, PdfPipelineOptions
from docling.datamodel import asr_model_specs
from docling.datamodel.base_models import InputFormat
from docling.pipeline.asr_pipeline import AsrPipeline
from docling.backend.docling_parse_backend import DoclingParseDocumentBackend

try:
    import whisper
    WHISPER_AVAILABLE = True
except ImportError:
    WHISPER_AVAILABLE = False

try:
    import torch
    import torchaudio
    TORCHAUDIO_AVAILABLE = True
except ImportError:
    TORCHAUDIO_AVAILABLE = False

from backend.config import settings
from backend.database.connection import db_manager, get_db_session
from backend.database.operations import (
    create_document,
    create_chunk,
    delete_all_documents,
    get_document_count,
    get_chunk_count
)
from backend.ingestion.chunker import ChunkingConfig, create_chunker, DocumentChunk
from backend.ingestion.embedder import OllamaEmbedder

try:
    from backend.core.observability import metrics
    METRICS_AVAILABLE = True
except ImportError:
    METRICS_AVAILABLE = False

logger = logging.getLogger(__name__)


class IngestionPipeline:
    """Pipeline for ingesting documents into the RAG system."""
    
    def __init__(
        self,
        documents_folder: str = "documents",
        clean_before_ingest: bool = True,
        chunk_size: int = 1000,
        chunk_overlap: int = 200,
        use_semantic_chunking: bool = True
    ):
        """
        Initialize ingestion pipeline.
        
        Args:
            documents_folder: Folder containing documents
            clean_before_ingest: Whether to clean existing data first
            chunk_size: Target chunk size in characters
            chunk_overlap: Overlap between chunks
            use_semantic_chunking: Use Docling HybridChunker
        """
        self.documents_folder = documents_folder
        self.clean_before_ingest = clean_before_ingest
        
        # Initialize chunker
        chunker_config = ChunkingConfig(
            chunk_size=chunk_size,
            chunk_overlap=chunk_overlap,
            max_tokens=settings.max_tokens_per_chunk,
            use_semantic_splitting=use_semantic_chunking
        )
        self.chunker = create_chunker(chunker_config)
        
        # Initialize embedder with configurable batch size
        self.embedder = OllamaEmbedder(batch_size=settings.embedding_batch_size)
    
    def _find_document_files(self) -> List[str]:
        """Find all supported document files."""
        if not os.path.exists(self.documents_folder):
            logger.error(f"Documents folder not found: {self.documents_folder}")
            return []
        
        # Supported file patterns
        patterns = [
            "*.md", "*.markdown", "*.txt", 
            "*.pdf",  
            "*.docx", "*.doc", 
            "*.pptx", "*.ppt", 
            "*.xlsx", "*.xls", 
            "*.html", "*.htm",  
            "*.mp3", "*.wav", "*.m4a", "*.flac", 
        ]
        
        files = []
        for pattern in patterns:
            files.extend(
                glob.glob(
                    os.path.join(self.documents_folder, "**", pattern),
                    recursive=True
                )
            )
        
        return sorted(files)
    
    def _read_document(self, file_path: str) -> tuple[str, Optional[Any]]:
        """
        Read document content from file.
        
        Args:
            file_path: Path to document file
            
        Returns:
            Tuple of (content, docling_document)
        """
        file_ext = os.path.splitext(file_path)[1].lower()
        
        # Audio formats - transcribe with Whisper
        audio_formats = ['.mp3', '.wav', '.m4a', '.flac']
        if file_ext in audio_formats:
            content = self._transcribe_audio(file_path)
            return (content, None)
        
        # Docling-supported formats
        docling_formats = ['.pdf', '.docx', '.doc', '.pptx', '.ppt', '.xlsx', '.xls', '.html', '.htm']
        
        if file_ext in docling_formats:
            try:
                logger.info(f"Converting {file_ext} file using Docling: {os.path.basename(file_path)}")
                
                # Use default converter - Docling will handle optimization automatically
                converter = DocumentConverter()
                
                logger.info(f"Starting document conversion...")
                result = converter.convert(file_path)
                
                # Try both export methods and use the one with more content
                markdown_content = result.document.export_to_markdown()
                text_content = result.document.export_to_text()
                
                # Use whichever has more content (sometimes markdown export fails)
                if len(text_content) > len(markdown_content):
                    logger.info(f"Using text export (more content than markdown)")
                    final_content = text_content
                else:
                    final_content = markdown_content
                
                # Log content stats to verify extraction
                logger.info(f"Successfully converted {os.path.basename(file_path)}")
                logger.info(f"  - Markdown export: {len(markdown_content)} characters")
                logger.info(f"  - Text export: {len(text_content)} characters")
                logger.info(f"  - Using: {'text' if len(text_content) > len(markdown_content) else 'markdown'}")
                
                return (final_content, result.document)
                
            except Exception as e:
                logger.error(f"Failed to convert {file_path} with Docling: {e}")
                # Fall back to raw text
                try:
                    with open(file_path, 'r', encoding='utf-8') as f:
                        return (f.read(), None)
                except:
                    return (f"[Error: Could not read file {os.path.basename(file_path)}]", None)
        
        # Text-based formats
        else:
            try:
                with open(file_path, 'r', encoding='utf-8') as f:
                    return (f.read(), None)
            except UnicodeDecodeError:
                with open(file_path, 'r', encoding='latin-1') as f:
                    return (f.read(), None)
    
    def _transcribe_audio(self, file_path: str) -> str:
        """Transcribe audio file using Whisper (via Docling or direct)."""
        audio_path = Path(file_path).resolve()
        logger.info(f"="*80)
        logger.info(f"AUDIO TRANSCRIPTION STARTING")
        logger.info(f"File: {audio_path.name}")
        logger.info(f"Path: {audio_path}")
        logger.info(f"Exists: {audio_path.exists()}")
        logger.info(f"Size: {audio_path.stat().st_size if audio_path.exists() else 'N/A'} bytes")
        logger.info(f"="*80)
        
        if not audio_path.exists():
            error_msg = f"[Error: Audio file not found - {os.path.basename(file_path)}]"
            logger.error(error_msg)
            return error_msg
        
        # Method 1: Try Docling with Whisper
        try:
            logger.info(f"Method 1: Trying Docling with Whisper Turbo (CPU mode)")
            
            pipeline_options = AsrPipelineOptions()
            pipeline_options.asr_options = asr_model_specs.WHISPER_TURBO
            
            logger.info(f"Creating DocumentConverter with audio format options...")
            converter = DocumentConverter(
                format_options={
                    InputFormat.AUDIO: AudioFormatOption(
                        pipeline_cls=AsrPipeline,
                        pipeline_options=pipeline_options,
                    )
                }
            )
            
            logger.info(f"Starting audio conversion with Docling...")
            result = converter.convert(audio_path)
            
            logger.info(f"Extracting transcribed text...")
            markdown_content = result.document.export_to_markdown().strip()
            
            if not markdown_content:
                logger.warning(f"Markdown export empty, trying text export...")
                markdown_content = result.document.export_to_text().strip()
            
            if not markdown_content:
                raise RuntimeError("Docling transcription produced empty result")
            
            logger.info(f"="*80)
            logger.info(f"TRANSCRIPTION SUCCESSFUL (Docling)")
            logger.info(f"Transcribed length: {len(markdown_content)} characters")
            logger.info(f"Preview: {markdown_content[:200]}...")
            logger.info(f"="*80)
            
            return markdown_content
            
        except Exception as docling_error:
            logger.warning(f"Docling transcription failed: {docling_error}")
            logger.warning(f"Trying fallback method with OpenAI Whisper directly...")
            
            # Method 2: Fallback to direct OpenAI Whisper
            if not WHISPER_AVAILABLE:
                error_msg = f"[Error: Audio transcription failed. Whisper not available. Install with: pip install openai-whisper]"
                logger.error(error_msg)
                logger.error(f"Docling error was: {docling_error}", exc_info=True)
                return error_msg
            
            try:
                logger.info(f"Method 2: Using OpenAI Whisper with audio pre-loading")
                
                # Check if FFmpeg error - try to load audio manually first
                if not TORCHAUDIO_AVAILABLE:
                    raise RuntimeError("torchaudio not available for audio loading")
                
                logger.info(f"Loading audio without FFmpeg using pydub + soundfile...")
                try:
                    from pydub import AudioSegment
                    import soundfile as sf
                    import tempfile
                    
                    # Load audio with pydub (supports MP3, WAV, etc.)
                    logger.info(f"Loading audio file with pydub...")
                    audio = AudioSegment.from_file(str(audio_path))
                    
                    # Convert to mono if stereo
                    if audio.channels > 1:
                        logger.info(f"Converting from {audio.channels} channels to mono...")
                        audio = audio.set_channels(1)
                    
                    # Set sample rate to 16kHz (Whisper requirement)
                    if audio.frame_rate != 16000:
                        logger.info(f"Resampling from {audio.frame_rate}Hz to 16000Hz...")
                        audio = audio.set_frame_rate(16000)
                    
                    # Export to temporary WAV file for processing
                    with tempfile.NamedTemporaryFile(suffix='.wav', delete=False) as temp_wav:
                        temp_wav_path = temp_wav.name
                        logger.info(f"Converting to WAV format: {temp_wav_path}")
                        audio.export(temp_wav_path, format='wav')
                    
                    # Load WAV with soundfile to get numpy array
                    logger.info(f"Loading WAV with soundfile...")
                    audio_array, sample_rate = sf.read(temp_wav_path)
                    
                    # Cleanup temp file
                    try:
                        os.unlink(temp_wav_path)
                    except:
                        pass
                    
                    logger.info(f"Audio loaded: {len(audio_array)} samples at {sample_rate}Hz")
                    
                except Exception as audio_load_error:
                    logger.error(f"Failed to load audio: {audio_load_error}", exc_info=True)
                    raise RuntimeError(
                        f"Audio loading failed. "
                        f"Error: {audio_load_error}. "
                        f"Tip: Ensure pydub and soundfile are installed."
                    )
                
                # Now transcribe with Whisper using the pre-loaded audio
                logger.info(f"Loading Whisper base model...")
                model = whisper.load_model("base")
                
                logger.info(f"Transcribing audio (using pre-loaded array)...")
                result = model.transcribe(audio_array, fp16=False)  # Pass numpy array directly
                
                transcribed_text = result["text"].strip()
                
                if not transcribed_text:
                    raise RuntimeError("Whisper transcription produced empty result")
                
                logger.info(f"="*80)
                logger.info(f"TRANSCRIPTION SUCCESSFUL (Whisper + torchaudio)")
                logger.info(f"Transcribed length: {len(transcribed_text)} characters")
                logger.info(f"Language detected: {result.get('language', 'unknown')}")
                logger.info(f"Preview: {transcribed_text[:200]}...")
                logger.info(f"="*80)
                
                return transcribed_text
                
            except Exception as whisper_error:
                logger.error(f"Whisper fallback also failed: {whisper_error}", exc_info=True)
                
                # Check if it's FFmpeg error
                error_str = str(whisper_error).lower()
                if 'ffmpeg' in error_str or 'system cannot find the file' in error_str or isinstance(whisper_error, FileNotFoundError):
                    error_msg = (
                        f"[Error: FFmpeg is required for audio transcription but not found. "
                        f"Please install FFmpeg: "
                        f"Windows: choco install ffmpeg OR download from https://ffmpeg.org/download.html]"
                    )
                    logger.error(error_msg)
                    return error_msg
                
                error_msg = f"[Error: Audio transcription failed - {type(whisper_error).__name__}: {str(whisper_error)}]"
                logger.error(error_msg)
                logger.error(f"Docling error: {docling_error}", exc_info=True)
                logger.error(f"Whisper error: {whisper_error}", exc_info=True)
                return error_msg
    
    def _extract_title(self, content: str, file_path: str) -> str:
        """Extract title from document content or filename."""
        # Try to find markdown title
        lines = content.split('\n')
        for line in lines[:10]:
            line = line.strip()
            if line.startswith('# '):
                return line[2:].strip()
        
        # Fallback to filename
        return os.path.splitext(os.path.basename(file_path))[0]
    
    async def _ingest_single_document(
        self,
        session: AsyncSession,
        file_path: str
    ) -> Dict[str, Any]:
        """
        Ingest a single document.
        
        Args:
            session: Database session
            file_path: Path to document file
            
        Returns:
            Ingestion result dictionary
        """
        start_time = datetime.now()
        
        # Read document
        content, docling_doc = self._read_document(file_path)
        title = self._extract_title(content, file_path)
        source = os.path.relpath(file_path, self.documents_folder)
        
        # Check if document already exists with embeddings
        from backend.database.operations import get_document_by_source
        existing_doc = await get_document_by_source(session, source)
        if existing_doc and existing_doc.chunk_count and existing_doc.chunk_count > 0:
            logger.info(f"Skipping {title} - already processed with {existing_doc.chunk_count} chunks")
            return {
                "title": title,
                "chunks_created": existing_doc.chunk_count,
                "success": True,
                "skipped": True
            }
        
        logger.info(f"Processing: {title}")
        
        # Chunk document
        chunks = await self.chunker.chunk_document(
            content=content,
            title=title,
            source=source,
            metadata={"file_path": file_path},
            docling_doc=docling_doc
        )
        
        if not chunks:
            logger.warning(f"No chunks created for {title}")
            return {
                "title": title,
                "chunks_created": 0,
                "success": False,
                "error": "No chunks created"
            }
        
        logger.info(f"Created {len(chunks)} chunks")
        
        # Generate embeddings with configured batch delay
        embedded_chunks = await self.embedder.embed_chunks(
            chunks, 
            batch_delay=settings.embedding_batch_delay
        )
        logger.info(f"Generated embeddings for {len(embedded_chunks)} chunks")
        
        # Save to database
        document = await create_document(
            session,
            title=title,
            source=source,
            content=content,
            metadata={"file_path": file_path, "ingestion_date": datetime.now().isoformat()}
        )
        
        for chunk in embedded_chunks:
            await create_chunk(
                session,
                document_id=document.id,
                content=chunk.content,
                embedding=chunk.embedding,
                chunk_index=chunk.index,
                token_count=chunk.token_count,
                metadata=chunk.metadata
            )
        
        await session.commit()
        
        processing_time = (datetime.now() - start_time).total_seconds()
        logger.info(f"Saved document to database: {document.id}")
        
        # Record metrics
        if METRICS_AVAILABLE:
            metrics.ingestion_documents_total.labels(status="success").inc()
            metrics.ingestion_chunks_created.inc(len(chunks))
            metrics.ingestion_duration.observe(processing_time)
        
        return {
            "title": title,
            "chunks_created": len(chunks),
            "processing_time": processing_time,
            "success": True
        }
    
    async def run(self):
        """Run the ingestion pipeline."""
        logger.info("Starting document ingestion pipeline...")
        
        # Initialize database
        if not db_manager.engine:
            await db_manager.initialize()
        
        # Clean database if requested
        if self.clean_before_ingest:
            logger.warning("Cleaning existing data...")
            async with db_manager.get_session() as session:
                deleted = await delete_all_documents(session)
                await session.commit()
                logger.info(f"Deleted {deleted} existing documents")
        
        # Find documents
        document_files = self._find_document_files()
        
        if not document_files:
            logger.warning(f"No documents found in {self.documents_folder}")
            return
        
        logger.info(f"Found {len(document_files)} documents to process")
        
        # Process documents
        results = []
        for i, file_path in enumerate(document_files, 1):
            logger.info(f"\n[{i}/{len(document_files)}] Processing: {os.path.basename(file_path)}")
            
            try:
                async with db_manager.get_session() as session:
                    result = await self._ingest_single_document(session, file_path)
                    results.append(result)
                    
            except Exception as e:
                logger.error(f"Failed to process {file_path}: {e}", exc_info=True)
                results.append({
                    "title": os.path.basename(file_path),
                    "chunks_created": 0,
                    "success": False,
                    "error": str(e)
                })
        
        # Print summary
        print("\n" + "="*60)
        print("INGESTION SUMMARY")
        print("="*60)
        
        successful = sum(1 for r in results if r["success"])
        total_chunks = sum(r["chunks_created"] for r in results)
        errors = [r.get("error", "Unknown error") for r in results if not r["success"]]
        
        print(f"Documents processed: {len(results)}")
        print(f"Successful: {successful}")
        print(f"Failed: {len(results) - successful}")
        print(f"Total chunks created: {total_chunks}")
        print()
        
        # Print individual results
        for result in results:
            status = "✓" if result["success"] else "✗"
            print(f"{status} {result['title']}: {result['chunks_created']} chunks")
            if not result["success"]:
                print(f"  Error: {result.get('error', 'Unknown error')}")
        
        print("="*60)
        
        # Final stats
        async with db_manager.get_session() as session:
            doc_count = await get_document_count(session)
            chunk_count = await get_chunk_count(session)
            print(f"\nKnowledge base now contains:")
            print(f"  Documents: {doc_count}")
            print(f"  Chunks: {chunk_count}")
        
        # Return results for API
        return {
            "success": successful > 0,
            "message": f"Processed {len(results)} documents successfully" if successful > 0 else "All documents failed to process",
            "documents_processed": successful,
            "chunks_created": total_chunks,
            "errors": errors
        }


async def main():
    """Main entry point for ingestion script."""
    parser = argparse.ArgumentParser(description="Ingest documents into RAG system")
    parser.add_argument(
        "--documents", "-d",
        default="documents",
        help="Documents folder path"
    )
    parser.add_argument(
        "--no-clean",
        action="store_true",
        help="Don't clean existing data before ingestion"
    )
    parser.add_argument(
        "--chunk-size",
        type=int,
        default=1000,
        help="Chunk size for splitting documents"
    )
    parser.add_argument(
        "--chunk-overlap",
        type=int,
        default=200,
        help="Chunk overlap size"
    )
    parser.add_argument(
        "--no-semantic",
        action="store_true",
        help="Disable semantic chunking"
    )
    parser.add_argument(
        "--verbose", "-v",
        action="store_true",
        help="Enable verbose logging"
    )
    
    args = parser.parse_args()
    
    # Configure logging
    log_level = logging.DEBUG if args.verbose else logging.INFO
    logging.basicConfig(
        level=log_level,
        format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
    )
    
    # Create and run pipeline
    pipeline = IngestionPipeline(
        documents_folder=args.documents,
        clean_before_ingest=not args.no_clean,
        chunk_size=args.chunk_size,
        chunk_overlap=args.chunk_overlap,
        use_semantic_chunking=not args.no_semantic
    )
    
    try:
        await pipeline.run()
    except KeyboardInterrupt:
        logger.info("\nIngestion interrupted by user")
    except Exception as e:
        logger.error(f"Ingestion failed: {e}", exc_info=True)
        raise
    finally:
        await db_manager.close()


if __name__ == "__main__":
    asyncio.run(main())
