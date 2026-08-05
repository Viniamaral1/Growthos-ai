# GrowthOS Universal Import v1.1

Replace only the files included in this package, preserving their folder paths.

## Included changes
- Universal upload enabled in Business Intelligence for the extractor-supported formats.
- File-type cards now show counts and filter the library.
- Asset preview modal with a scrollable extracted-text view.
- Asset deletion removes the database record, chunks, and stored file.
- Asset cards include Open, Ask AI, Use source, and Delete.
- Composer attachments clear as soon as a valid message starts sending.
- Knowledge-space suggestion avoids a space name when it is mentioned in a negative context such as “unrelated to Meat Farm”.
- Images are described honestly as metadata-only in this local release.
- Safe modal containment prevents preview actions from being cut off.

## Not included
- Moving a Business Intelligence asset into a Knowledge Space. The current document model has no Knowledge Space relationship, so adding Move safely requires a database migration and explicit product behaviour for whether the file, its extracted text, or a linked Knowledge item should move.
- OCR or visual understanding for images.

## Validation
- Python route compilation passed.
- TypeScript compiler could not complete because the clean review package excludes React/Next dependencies. No parser-level errors were observed before dependency resolution errors.
