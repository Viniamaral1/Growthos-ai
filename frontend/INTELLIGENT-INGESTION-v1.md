# GrowthOS Intelligent Ingestion v1

## What changed

- Business Intelligence now supports selecting multiple files in one upload.
- Files are processed sequentially to avoid sudden CPU/RAM spikes.
- Every processed asset can receive an ingestion assessment combining:
  - asset type detection;
  - existing document classification;
  - project relevance;
  - confidence;
  - grounded reasons;
  - recommended next actions.
- Bulk uploads no longer open one blocking project-relevance modal per file.
- A compact Intelligent Ingestion tray groups results into:
  - strong matches;
  - needs review;
  - low-fit assets.
- Strong matches can be accepted together.
- Questionable items remain individually reviewable.
- Each item can be kept and mapped, moved to a better workspace when available, kept without mapping, or removed.
- Automatic mode still maps only high-confidence matches. Medium/low confidence items stay in the review tray.
- Manual mode remains available and does not run automatic ingestion assessment.

## Architecture

The assessment endpoint is intentionally lightweight. It reuses the existing deterministic document classifier and semantic project-relevance service rather than starting another large LLM request.

Pipeline:

Upload -> Extract -> Embed -> Classify -> Project fit -> Recommended actions -> User review -> Optional entity mapping

## Suggested test

1. Set entity mapping to Suggest.
2. Select 3-5 files at once, including at least one clearly unrelated file.
3. Upload them together.
4. Confirm there is one compact tray, not one modal per file.
5. Confirm strong/review/low-fit counts look reasonable.
6. Use Accept strong matches.
7. Review the unrelated file separately and either move, keep, or remove it.
8. Confirm Business Intelligence remains responsive and the files appear in the library.
9. Repeat in Automatic mode: only strong matches should auto-map.
10. Repeat in Manual mode: files should process without ingestion prompts.
