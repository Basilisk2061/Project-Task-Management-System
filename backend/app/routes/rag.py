from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models import Document, User
from app.rag.document_processor import process_project_documents
from app.rag.embeddings import GeminiConfigurationError, GeminiEmbeddingError
from app.rag.generator import (
    NvidiaAuthenticationError,
    NvidiaConfigurationError,
    NvidiaProviderError,
    NvidiaRateLimitError,
    NvidiaResponseError,
    NvidiaTimeoutError,
    generate_grounded_answer,
)
from app.rag.vector_store import (
    NoProcessableDocumentsError,
    ProjectIndexNotFoundError,
    ProjectIndexStaleError,
    ProjectIndexStorageError,
    TOP_K,
    build_project_index,
    search_project_index,
)
from app.routes.projects import get_accessible_project
from app.schemas import (
    RagAskRequest,
    RagAskResponse,
    RagIndexBuildResponse,
    RagProjectInspectionResponse,
    RagSearchRequest,
    RagSearchResponse,
)


router = APIRouter(tags=["rag-inspection"])

CHUNK_PREVIEW_LENGTH = 200
MAX_CHUNK_PREVIEWS_PER_DOCUMENT = 10


def get_project_documents(project_id: int, db: Session) -> list[Document]:
    return (
        db.query(Document)
        .filter(Document.project_id == project_id)
        .order_by(Document.created_at.asc(), Document.id.asc())
        .all()
    )


def raise_rag_http_error(exc: Exception) -> None:
    if isinstance(exc, NoProcessableDocumentsError):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="No project documents with extractable text are available for indexing",
        ) from exc
    if isinstance(exc, ProjectIndexNotFoundError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project document index has not been built. Build the index before searching",
        ) from exc
    if isinstance(exc, ProjectIndexStaleError):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Project document index is out of date. Rebuild the index before searching",
        ) from exc
    if isinstance(exc, GeminiConfigurationError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Gemini embeddings are not configured on the server",
        ) from exc
    if isinstance(exc, GeminiEmbeddingError):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Unable to generate document embeddings. Check the server credentials or quota",
        ) from exc
    if isinstance(exc, ProjectIndexStorageError):
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to read or write the project document index",
        ) from exc
    if isinstance(exc, NvidiaConfigurationError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="NVIDIA answer generation is not configured on the server",
        ) from exc
    if isinstance(exc, NvidiaAuthenticationError):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="NVIDIA answer generation rejected the server credentials",
        ) from exc
    if isinstance(exc, NvidiaRateLimitError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="NVIDIA answer generation is temporarily rate limited",
        ) from exc
    if isinstance(exc, NvidiaTimeoutError):
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="NVIDIA answer generation timed out",
        ) from exc
    if isinstance(exc, (NvidiaProviderError, NvidiaResponseError)):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="NVIDIA answer generation returned an unusable response",
        ) from exc
    raise exc


def create_chunk_preview(text: str) -> str:
    compact_text = " ".join(text.split())
    if len(compact_text) <= CHUNK_PREVIEW_LENGTH:
        return compact_text
    return f"{compact_text[:CHUNK_PREVIEW_LENGTH - 3].rstrip()}..."


@router.get(
    "/api/projects/{project_id}/rag/inspect",
    response_model=RagProjectInspectionResponse,
)
def inspect_project_documents(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    project = get_accessible_project(project_id, current_user.id, db)
    documents = get_project_documents(project.id, db)
    processed_documents = process_project_documents(documents, project.id)

    document_inspections = []
    total_chunks = 0
    for result in processed_documents:
        chunks = result["chunks"]
        total_chunks += len(chunks)
        document_inspections.append({
            "document_id": result["document_id"],
            "file_name": result["file_name"],
            "status": result["status"],
            "character_count": result["character_count"],
            "chunk_count": len(chunks),
            "message": result["message"],
            "chunks": [
                {
                    "chunk_index": chunk["chunk_index"],
                    "preview": create_chunk_preview(chunk["text"]),
                }
                for chunk in chunks[:MAX_CHUNK_PREVIEWS_PER_DOCUMENT]
            ],
        })

    return {
        "project_id": project.id,
        "document_count": len(documents),
        "total_chunks": total_chunks,
        "documents": document_inspections,
    }


@router.post(
    "/api/projects/{project_id}/rag/index",
    response_model=RagIndexBuildResponse,
)
def index_project_documents(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    project = get_accessible_project(project_id, current_user.id, db)
    documents = get_project_documents(project.id, db)
    try:
        return build_project_index(project.id, documents)
    except (
        NoProcessableDocumentsError,
        GeminiConfigurationError,
        GeminiEmbeddingError,
        ProjectIndexStorageError,
    ) as exc:
        raise_rag_http_error(exc)


@router.post(
    "/api/projects/{project_id}/rag/search",
    response_model=RagSearchResponse,
)
def search_project_documents(
    project_id: int,
    data: RagSearchRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    project = get_accessible_project(project_id, current_user.id, db)
    documents = get_project_documents(project.id, db)
    try:
        results = search_project_index(project.id, documents, data.question)
    except (
        ProjectIndexNotFoundError,
        ProjectIndexStaleError,
        GeminiConfigurationError,
        GeminiEmbeddingError,
        ProjectIndexStorageError,
    ) as exc:
        raise_rag_http_error(exc)
    return {
        "project_id": project.id,
        "question": data.question,
        "top_k": TOP_K,
        "results": results,
    }


@router.post(
    "/api/projects/{project_id}/rag/ask",
    response_model=RagAskResponse,
)
def ask_project_documents(
    project_id: int,
    data: RagAskRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    project = get_accessible_project(project_id, current_user.id, db)
    documents = get_project_documents(project.id, db)
    try:
        retrieved_chunks = search_project_index(project.id, documents, data.question)
        generated = generate_grounded_answer(data.question, retrieved_chunks)
    except (
        ProjectIndexNotFoundError,
        ProjectIndexStaleError,
        GeminiConfigurationError,
        GeminiEmbeddingError,
        ProjectIndexStorageError,
        NvidiaConfigurationError,
        NvidiaAuthenticationError,
        NvidiaRateLimitError,
        NvidiaTimeoutError,
        NvidiaProviderError,
        NvidiaResponseError,
    ) as exc:
        raise_rag_http_error(exc)

    selected_sources = []
    for source_number in generated["source_numbers"]:
        chunk = retrieved_chunks[source_number - 1]
        selected_sources.append({
            "source_number": source_number,
            "document_id": chunk["document_id"],
            "file_name": chunk["file_name"],
            "chunk_index": chunk["chunk_index"],
        })
    return {
        "project_id": project.id,
        "question": data.question,
        "answer": generated["answer"],
        "grounded": generated["grounded"],
        "sources": selected_sources,
    }
