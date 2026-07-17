from functools import lru_cache
from typing import Iterable

import numpy as np
from fastembed import TextEmbedding


EMBEDDING_MODEL_NAME = "BAAI/bge-small-en-v1.5"


@lru_cache(maxsize=1)
def get_embedding_model() -> TextEmbedding:
    """
    Load and cache the embedding model.

    The model is created only once while the API process is running.
    """

    return TextEmbedding(
        model_name=EMBEDDING_MODEL_NAME,
    )


def create_embeddings(
    texts: Iterable[str],
) -> list[list[float]]:
    """
    Convert a collection of texts into numerical embeddings.
    """

    cleaned_texts = [
        text.strip()
        for text in texts
        if text and text.strip()
    ]

    if not cleaned_texts:
        return []

    model = get_embedding_model()

    generated_embeddings = model.embed(
        cleaned_texts
    )

    return [
        embedding.astype(
            np.float32
        ).tolist()
        for embedding in generated_embeddings
    ]


def create_query_embedding(
    query: str,
) -> list[float]:
    """
    Create one embedding for a search query.
    """

    cleaned_query = query.strip()

    if not cleaned_query:
        raise ValueError(
            "The search query cannot be empty."
        )

    embeddings = create_embeddings(
        [cleaned_query]
    )

    if not embeddings:
        raise ValueError(
            "The query embedding could not be created."
        )

    return embeddings[0]


def cosine_similarity_score(
    first_vector: list[float],
    second_vector: list[float],
) -> float:
    """
    Calculate cosine similarity between two vectors.
    """

    first = np.asarray(
        first_vector,
        dtype=np.float32,
    )

    second = np.asarray(
        second_vector,
        dtype=np.float32,
    )

    if first.shape != second.shape:
        raise ValueError(
            "Embedding vectors must have the same dimensions."
        )

    denominator = (
        np.linalg.norm(first)
        * np.linalg.norm(second)
    )

    if denominator == 0:
        return 0.0

    return float(
        np.dot(first, second)
        / denominator
    )