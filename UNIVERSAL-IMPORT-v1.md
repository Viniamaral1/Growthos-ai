# GrowthOS Universal Business Import v1

Replace only the files included in this package, preserving their folder paths.

## Supported imports

- PDF
- Word DOCX
- Excel XLSX
- CSV and TSV
- JSON
- TXT, Markdown and basic RTF
- HTML
- EML email files
- PNG, JPG/JPEG, WEBP, BMP and GIF

## Behaviour

- Uses the existing upload, processing, chunking, embedding and classification pipeline.
- Keeps the existing six-file attachment limit and 10 MB per-file server limit.
- Unsupported formats are skipped with a clear message.
- Legacy DOC and XLS should be saved as DOCX and XLSX first.
- Image files are stored and indexed by filename and image metadata in this local version. OCR/visual text recognition is not enabled yet.

## Testing

1. Restart backend and frontend.
2. Attach one small file of each format you use.
3. Confirm it uploads, processes, appears in the attachment bar and can be discussed in chat.
4. Test mixed files in one upload.
5. Confirm existing PDF upload still works.

Backend Python compilation and extractor smoke tests passed. A full Next.js build was not available because dependencies were excluded from the uploaded package.
