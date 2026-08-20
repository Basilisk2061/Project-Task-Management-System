import json
import shutil
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from uuid import uuid4

import faiss
import numpy as np

from app.document_storage import BACKEND_ROOT
from app.models import Document
from app.rag.document_processor import DocumentChunk, process_project_documents
from app.rag.embeddings import (
    EmbeddingProvider,
    GeminiEmbeddingService,
    get_configured_embedding_model,
)


TOP_K = 4
INDEX_VERSION = 1
RAG_INDEX_ROOT = (BACKEND_ROOT / "rag_indexes").resolve()
INDEX_FILENAME = "index.faiss"
CHUNKS_FILENAME = "chunks.json"
METADATA_FILENAME = "metadata.json"


class NoProcessableDocumentsError(Exception):
    pass


class ProjectIndexNotFoundError(Exception):
    pass


class ProjectIndexStaleError(Exception):
    pass


class ProjectIndexStorageError(Exception):
    pass


def get_project_index_directory(project_id: int) -> Path:
    directory = (RAG_INDEX_ROOT / f"project_{project_id}").resolve()
    directory.relative_to(RAG_INDEX_ROOT)
    return directory


def delete_project_index(project_id: int) -> None:
    directory = get_project_index_directory(project_id)
    if directory.exists():
        shutil.rmtree(directory)


def build_document_snapshot(documents: list[Document]) -> list[dict]:
    return [
        {
            "document_id": document.id,
            "file_name": document.file_name,
            "created_at": document.created_at.isoformat() if document.created_at else None,
        }
        for document in sorted(documents, key=lambda item: item.id)
    ]


def _validate_project_documents(project_id: int, documents: list[Document]) -> None:
    if any(document.project_id != project_id for document in documents):
        raise ValueError("All documents must belong to the requested project")


def _normalize_vectors(vectors: np.ndarray) -> np.ndarray:
    normalized = np.ascontiguousarray(vectors, dtype=np.float32)
    if normalized.ndim != 2 or normalized.shape[0] == 0 or normalized.shape[1] == 0:
        raise ValueError("Embedding vectors must be a non-empty two-dimensional array")
    if not np.isfinite(normalized).all():
        raise ValueError("Embedding vectors contain non-finite values")
    norms = np.linalg.norm(normalized, axis=1)
    if np.any(norms == 0):
        raise ValueError("Embedding vectors cannot have zero magnitude")
    faiss.normalize_L2(normalized)
    return normalized


def _write_json(path: Path, payload) -> None:
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")


def _persist_project_index(project_id: int, index, chunks: list[DocumentChunk], metadata: dict) -> None:
    RAG_INDEX_ROOT.mkdir(parents=True, exist_ok=True)
    target_directory = get_project_index_directory(project_id)
    temporary_directory = Path(tempfile.mkdtemp(prefix=f".project_{project_id}_", dir=RAG_INDEX_ROOT))
    backup_directory = RAG_INDEX_ROOT / f".project_{project_id}_backup_{uuid4().hex}"
    replaced_existing = False
    try:
        faiss.write_index(index, str(temporary_directory / INDEX_FILENAME))
        _write_json(temporary_directory / CHUNKS_FILENAME, chunks)
        _write_json(temporary_directory / METADATA_FILENAME, metadata)

        if target_directory.exists():
            target_directory.rename(backup_directory)
            replaced_existing = True
        temporary_directory.rename(target_directory)
        if replaced_existing:
            shutil.rmtree(backup_directory)
    except Exception as exc:
        if not target_directory.exists() and replaced_existing and backup_directory.exists():
            backup_directory.rename(target_directory)
        raise ProjectIndexStorageError("Unable to persist project index") from exc
    finally:
        if temporary_directory.exists():
            shutil.rmtree(temporary_directory, ignore_errors=True)
        if backup_directory.exists() and target_directory.exists():
            shutil.rmtree(backup_directory, ignore_errors=True)


def build_project_index(
    project_id: int,
    documents: list[Document],
    embedding_service: EmbeddingProvider | None = None,
) -> dict:
    _validate_project_documents(project_id, documents)
    processed_documents = process_project_documents(documents, project_id)
    chunks = [chunk for result in processed_documents for chunk in result["chunks"]]
    if not chunks:
        raise NoProcessableDocumentsError("No extractable project document text is available for indexing")

    service = embedding_service or GeminiEmbeddingService()
    vectors = service.embed_documents([chunk["text"] for chunk in chunks])
    if vectors.shape[0] != len(chunks):
        raise ValueError("Embedding count does not match chunk count")
    normalized_vectors = _normalize_vectors(vectors)
    vector_dimension = int(normalized_vectors.shape[1])
    index = faiss.IndexFlatIP(vector_dimension)
    index.add(normalized_vectors)

    documents_processed = sum(1 for result in processed_documents if result["status"] == "processed")
    metadata = {
        "index_version": INDEX_VERSION,
        "project_id": project_id,
        "embedding_model": service.model,
        "vector_dimension": vector_dimension,
        "chunk_count": len(chunks),
        "build_timestamp": datetime.now(timezone.utc).isoformat(),
        "documents": build_document_snapshot(documents),
    }
    _persist_project_index(project_id, index, chunks, metadata)
    return {
        "project_id": project_id,
        "documents_processed": documents_processed,
        "chunks_indexed": len(chunks),
        "embedding_model": service.model,
        "vector_dimension": vector_dimension,
        "status": "ready",
    }


def _load_json(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ProjectIndexStorageError("Unable to load project index metadata") from exc


def _load_validated_index(project_id: int, documents: list[Document], embedding_model: str):
    _validate_project_documents(project_id, documents)
    directory = get_project_index_directory(project_id)
    if not directory.is_dir():
        raise ProjectIndexNotFoundError("Project document index has not been built")

    metadata = _load_json(directory / METADATA_FILENAME)
    chunks = _load_json(directory / CHUNKS_FILENAME)
    if metadata.get("project_id") != project_id or metadata.get("index_version") != INDEX_VERSION:
        raise ProjectIndexStorageError("Project index metadata is invalid")
    if metadata.get("embedding_model") != embedding_model:
        raise ProjectIndexStaleError("Project embedding model has changed. Rebuild the index")
    if metadata.get("documents") != build_document_snapshot(documents):
        raise ProjectIndexStaleError("Project document index is out of date. Rebuild the index")
    if not isinstance(chunks, list) or metadata.get("chunk_count") != len(chunks):
        raise ProjectIndexStorageError("Project chunk metadata is invalid")

    try:
        index = faiss.read_index(str(directory / INDEX_FILENAME))
    except Exception as exc:
        raise ProjectIndexStorageError("Unable to load FAISS project index") from exc
    if index.ntotal != len(chunks) or index.d != metadata.get("vector_dimension"):
        raise ProjectIndexStorageError("FAISS index does not match project metadata")
    return index, chunks, metadata


def get_project_index_status(project_id: int, documents: list[Document]) -> str:
    try:
        _load_validated_index(project_id, documents, get_configured_embedding_model())
    except ProjectIndexNotFoundError:
        return "missing"
    except ProjectIndexStaleError:
        return "stale"
    return "ready"


def search_project_index(
    project_id: int,
    documents: list[Document],
    question: str,
    top_k: int = TOP_K,
    embedding_service: EmbeddingProvider | None = None,
) -> list[dict]:
    cleaned_question = question.strip()
    if not cleaned_question:
        raise ValueError("Question cannot be empty")
    if top_k <= 0:
        raise ValueError("top_k must be greater than zero")

    service = embedding_service
    embedding_model = service.model if service else get_configured_embedding_model()
    index, chunks, metadata = _load_validated_index(project_id, documents, embedding_model)
    if service is None:
        service = GeminiEmbeddingService(model=embedding_model)
    query_vector = service.embed_query(cleaned_question)
    normalized_query = _normalize_vectors(query_vector)
    if normalized_query.shape[0] != 1 or normalized_query.shape[1] != metadata["vector_dimension"]:
        raise ValueError("Query embedding dimension does not match the project index")

    result_count = min(top_k, len(chunks))
    scores, positions = index.search(normalized_query, result_count)
    results = []
    for rank, (score, position) in enumerate(zip(scores[0], positions[0]), start=1):
        if position < 0:
            continue
        chunk = chunks[int(position)]
        results.append({
            "rank": rank,
            "document_id": chunk["document_id"],
            "file_name": chunk["file_name"],
            "chunk_index": chunk["chunk_index"],
            "score": round(float(score), 6),
            "text": chunk["text"],
        })
    return results
