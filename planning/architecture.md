# GrowthOS Target Architecture

## Current Architecture

```text
Next.js Frontend
        |
        v
FastAPI Backend
        |
        +--> Company Data
        +--> PDF Upload
        +--> Text Extraction
        +--> Chunking
        +--> Embeddings
        +--> SQLite
        +--> Semantic Retrieval
        +--> Ollama
                |
                +--> Grounded Answers
                +--> Marketing Content