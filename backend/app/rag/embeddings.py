import os
from typing import Protocol

import numpy as np
from google import genai
from google.genai import types


DEFAULT_EMBEDDING_MODEL = "gemini-embedding-001"
DOCUMENT_TASK_TYPE = "RETRIEVAL_DOCUMENT"
QUERY_TASK_TYPE = "RETRIEVAL_QUERY"
EMBEDDING_BATCH_SIZE = 20


def get_configured_embedding_model() -> str:
    return os.getenv("GEMINI_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL).strip() or DEFAULT_EMBEDDING_MODEL


class GeminiConfigurationError(Exception):
    """Raised when Gemini embedding configuration is missing."""


class GeminiEmbeddingError(Exception):
    """Raised when Gemini cannot return valid embeddings."""


class EmbeddingProvider(Protocol):
    model: str

    def embed_documents(self, texts: list[str]) -> np.ndarray: ...

    def embed_query(self, question: str) -> np.ndarray: ...


class GeminiEmbeddingService:
    def __init__(self, api_key: str | None = None, model: str | None = None, client=None):
        resolved_key = (api_key if api_key is not None else os.getenv("GEMINI_API_KEY", "")).strip()
        if not resolved_key:
            raise GeminiConfigurationError("Gemini API key is not configured")
        self.model = (model or get_configured_embedding_model()).strip() or DEFAULT_EMBEDDING_MODEL
        self._client = client or genai.Client(api_key=resolved_key)

    def _embed(self, texts: list[str], task_type: str) -> np.ndarray:
        if not texts:
            return np.empty((0, 0), dtype=np.float32)

        vectors: list[list[float]] = []
        try:
            for offset in range(0, len(texts), EMBEDDING_BATCH_SIZE):
                batch = texts[offset:offset + EMBEDDING_BATCH_SIZE]
                response = self._client.models.embed_content(
                    model=self.model,
                    contents=batch,
                    config=types.EmbedContentConfig(task_type=task_type),
                )
                embeddings = response.embeddings or []
                if len(embeddings) != len(batch):
                    raise GeminiEmbeddingError("Gemini returned an unexpected embedding count")
                for embedding in embeddings:
                    if not embedding.values:
                        raise GeminiEmbeddingError("Gemini returned an empty embedding")
                    vectors.append(embedding.values)
        except GeminiEmbeddingError:
            raise
        except Exception as exc:
            raise GeminiEmbeddingError("Gemini embedding request failed") from exc

        matrix = np.asarray(vectors, dtype=np.float32)
        if matrix.ndim != 2 or matrix.shape[0] != len(texts) or matrix.shape[1] == 0:
            raise GeminiEmbeddingError("Gemini returned invalid embedding dimensions")
        if not np.isfinite(matrix).all():
            raise GeminiEmbeddingError("Gemini returned non-finite embedding values")
        return matrix

    def embed_documents(self, texts: list[str]) -> np.ndarray:
        return self._embed(texts, DOCUMENT_TASK_TYPE)

    def embed_query(self, question: str) -> np.ndarray:
        cleaned_question = question.strip()
        if not cleaned_question:
            raise ValueError("Question cannot be empty")
        return self._embed([cleaned_question], QUERY_TASK_TYPE)
