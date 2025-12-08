"""
Quick test script for audio transcription.
Run this to test if audio transcription is working.
"""

import logging
import sys
from pathlib import Path

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)

logger = logging.getLogger(__name__)

def test_audio_transcription():
    """Test audio transcription with a sample file."""
    
    logger.info("="*80)
    logger.info("AUDIO TRANSCRIPTION TEST")
    logger.info("="*80)
    
    # Import after logging is setup
    from backend.ingestion.pipeline import IngestionPipeline
    
    # Create pipeline instance
    pipeline = IngestionPipeline(
        documents_folder="documents",
        clean_before_ingest=False
    )
    
    # Check for audio files
    audio_extensions = ['.mp3', '.wav', '.m4a', '.flac']
    documents_dir = Path("documents")
    
    if not documents_dir.exists():
        logger.error(f"Documents directory not found: {documents_dir}")
        return False
    
    audio_files = []
    for ext in audio_extensions:
        audio_files.extend(documents_dir.glob(f"**/*{ext}"))
    
    if not audio_files:
        logger.warning(f"No audio files found in {documents_dir}")
        logger.info(f"Please add an audio file (.mp3, .wav, .m4a, .flac) to the documents folder")
        return False
    
    # Test with first audio file found
    test_file = audio_files[0]
    logger.info(f"\nTesting with file: {test_file.name}")
    logger.info(f"File size: {test_file.stat().st_size} bytes")
    
    try:
        logger.info("\nStarting transcription...")
        transcribed_text = pipeline._transcribe_audio(str(test_file))
        
        logger.info("\n" + "="*80)
        logger.info("TRANSCRIPTION RESULT")
        logger.info("="*80)
        
        if transcribed_text.startswith("[Error:"):
            logger.error(f"Transcription failed: {transcribed_text}")
            return False
        else:
            logger.info(f"✅ SUCCESS!")
            logger.info(f"Transcribed {len(transcribed_text)} characters")
            logger.info(f"\nTranscription preview:")
            logger.info("-"*80)
            logger.info(transcribed_text[:500])
            if len(transcribed_text) > 500:
                logger.info(f"... ({len(transcribed_text) - 500} more characters)")
            logger.info("-"*80)
            return True
            
    except Exception as e:
        logger.error(f"Test failed with exception: {e}", exc_info=True)
        return False


if __name__ == "__main__":
    logger.info("Starting audio transcription test...")
    success = test_audio_transcription()
    
    if success:
        logger.info("\n✅ Audio transcription is working correctly!")
        sys.exit(0)
    else:
        logger.error("\n❌ Audio transcription test failed. Check logs above for details.")
        sys.exit(1)
