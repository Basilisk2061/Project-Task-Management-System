import re
from pathlib import Path
from typing import Iterable, Literal, TypedDict

from pypdf import PdfReader

from app.document_storage import get_stored_document_path
from app.models import Document


CHUNK_SIZE = 1000
CHUNK_OVERLAP = 200
BOUNDARY_SEARCH_LENGTH = 100

if CHUNK_OVERLAP >= CHUNK_SIZE:
    raise ValueError("CHUNK_OVERLAP must be smaller than CHUNK_SIZE")


class DocumentChunk(TypedDict):
    text: str
    document_id: int
    file_name: str
    chunk_index: int


class DocumentProcessingResult(TypedDict):
    document_id: int
    file_name: str
    status: Literal["processed", "no_extractable_text", "unreadable_pdf", "file_missing"]
    character_count: int
    chunks: list[DocumentChunk]
    message: str | None


class DocumentProcessingError(Exception):
    """Raised when an existing PDF cannot be parsed safely."""


def clean_extracted_text(text: str) -> str:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    cleaned_lines = [re.sub(r"[\t\f\v ]+", " ", line).strip() for line in normalized.split("\n")]
    cleaned = "\n".join(cleaned_lines)
    return re.sub(r"\n{3,}", "\n\n", cleaned).strip()


def extract_pdf_text(file_path: str | Path) -> str:
    try:
        reader = PdfReader(str(file_path))
        pages: list[str] = []
        for page in reader.pages:
            page_text = clean_extracted_text(page.extract_text() or "")
            if page_text:
                pages.append(page_text)
        return clean_extracted_text("\n\n".join(pages))
    except Exception as exc:
        raise DocumentProcessingError("Unable to read PDF content") from exc


def _adjust_chunk_end(text: str, start: int, proposed_end: int) -> int:
    if proposed_end >= len(text):
        return len(text)
    search_start = max(start + 1, proposed_end - BOUNDARY_SEARCH_LENGTH)
    for index in range(proposed_end, search_start, -1):
        if text[index - 1].isspace():
            return index
    return proposed_end


def _adjust_chunk_start(text: str, proposed_start: int, previous_end: int) -> int:
    if proposed_start <= 0 or proposed_start >= len(text):
        return proposed_start
    if text[proposed_start - 1].isspace() or text[proposed_start].isspace():
        return proposed_start

    search_end = min(previous_end, proposed_start + BOUNDARY_SEARCH_LENGTH)
    for index in range(proposed_start, search_end):
        if text[index].isspace():
            return index + 1
    return proposed_start


def split_text_into_chunks(
    text: str,
    document_id: int,
    file_name: str,
    chunk_size: int = CHUNK_SIZE,
    overlap: int = CHUNK_OVERLAP,
) -> list[DocumentChunk]:
    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than zero")
    if overlap < 0 or overlap >= chunk_size:
        raise ValueError("overlap must be non-negative and smaller than chunk_size")

    chunks: list[DocumentChunk] = []
    start = 0
    while start < len(text):
        proposed_end = min(start + chunk_size, len(text))
        end = _adjust_chunk_end(text, start, proposed_end)
        chunk_text = text[start:end].strip()
        if chunk_text:
            chunks.append({
                "text": chunk_text,
                "document_id": document_id,
                "file_name": file_name,
                "chunk_index": len(chunks),
            })
        if end >= len(text):
            break

        next_start = max(end - overlap, start + 1)
        next_start = _adjust_chunk_start(text, next_start, end)
        while next_start < len(text) and text[next_start].isspace():
            next_start += 1
        start = max(next_start, start + 1)
    return chunks


def process_document(document: Document, resolved_file_path: str | Path) -> DocumentProcessingResult:
    text = extract_pdf_text(resolved_file_path)
    if not text:
        return {
            "document_id": document.id,
            "file_name": document.file_name,
            "status": "no_extractable_text",
            "character_count": 0,
            "chunks": [],
            "message": "No extractable text found. Scanned PDFs require OCR.",
        }

    chunks = split_text_into_chunks(text, document.id, document.file_name)
    return {
        "document_id": document.id,
        "file_name": document.file_name,
        "status": "processed",
        "character_count": len(text),
        "chunks": chunks,
        "message": None,
    }


def process_project_documents(
    documents: Iterable[Document],
    project_id: int | None = None,
) -> list[DocumentProcessingResult]:
    project_documents = list(documents)
    expected_project_id = project_id
    if expected_project_id is None and project_documents:
        expected_project_id = project_documents[0].project_id
    if any(document.project_id != expected_project_id for document in project_documents):
        raise ValueError("All documents must belong to the requested project")

    results: list[DocumentProcessingResult] = []
    for document in project_documents:
        resolved_file_path = get_stored_document_path(document.file_path)
        if resolved_file_path is None or not resolved_file_path.is_file():
            results.append({
                "document_id": document.id,
                "file_name": document.file_name,
                "status": "file_missing",
                "character_count": 0,
                "chunks": [],
                "message": "Stored PDF file is unavailable.",
            })
            continue

        try:
            results.append(process_document(document, resolved_file_path))
        except DocumentProcessingError:
            results.append({
                "document_id": document.id,
                "file_name": document.file_name,
                "status": "unreadable_pdf",
                "character_count": 0,
                "chunks": [],
                "message": "PDF content could not be read.",
            })
    return results
