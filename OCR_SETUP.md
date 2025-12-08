# OCR Setup for Image Processing

Your RAG system now supports **images and handwritten documents** with OCR (Optical Character Recognition).

## Supported Image Formats
- JPG/JPEG
- PNG
- TIFF/TIF
- BMP
- WEBP

## OCR Engine Setup

### Windows

1. **Download Tesseract**
   - Download from: https://github.com/UB-Mannheim/tesseract/wiki
   - Install the latest version (e.g., `tesseract-ocr-w64-setup-5.3.3.20231005.exe`)

2. **Add to PATH**
   - During installation, check "Add to PATH" option
   - Or manually add: `C:\Program Files\Tesseract-OCR` to your system PATH

3. **Verify Installation**
   ```powershell
   tesseract --version
   ```

### Linux/Mac

```bash
# Ubuntu/Debian
sudo apt install tesseract-ocr

# Mac
brew install tesseract

# Verify
tesseract --version
```

## Python Dependencies

Already installed in your environment:
```bash
pip install pytesseract Pillow
```

## Optional: EasyOCR (Better for Handwriting)

For improved handwritten text recognition:
```bash
pip install easyocr
```

**Note:** EasyOCR requires Visual Studio Build Tools on Windows for scikit-image compilation. If you encounter issues, Tesseract alone works fine for most use cases.

## Usage

Simply upload image files through:
1. **Document Manager** - Upload tab
2. **Chat Interface** - Paperclip icon
3. **API** - `/upload` endpoint

The system will automatically:
- Detect image files
- Extract text using OCR
- Process and index the text
- Make it searchable in your RAG system

## Testing

Upload a test image with text:
1. Upload any image containing text (screenshot, photo of document, handwritten note)
2. Wait for processing to complete
3. Ask questions about the content
4. The system will retrieve relevant text from the image

## Troubleshooting

**Error: "Tesseract not found"**
- Ensure Tesseract is installed and in PATH
- Restart terminal/IDE after installation

**Empty OCR results**
- Check image quality (should be clear and readable)
- Ensure sufficient contrast between text and background
- Try higher resolution images

**Slow processing**
- Large images take longer to process
- Consider resizing very large images before upload
- Background processing via Inngest prevents UI blocking
