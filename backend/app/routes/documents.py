from pathlib import Path
from uuid import uuid4

from fastapi import APIRouter, Depends, File, Form, HTTPException, Response, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.constants import DOCUMENT_TYPES
from app.database import get_db
from app.document_storage import (
    get_database_storage_path,
    get_project_upload_directory,
    get_stored_document_path,
    remove_empty_project_directory,
)
from app.models import Document, User
from app.project_lifecycle import ensure_project_active
from app.routes.projects import get_accessible_project
from app.schemas import DocumentResponse


router = APIRouter(tags=["documents"])

MAX_PDF_SIZE = 10 * 1024 * 1024
UPLOAD_CHUNK_SIZE = 1024 * 1024
PDF_CONTENT_TYPES = {"application/pdf", "application/x-pdf"}


def get_accessible_document(document_id: int, user_id: int, db: Session) -> Document:
    document = db.query(Document).filter(Document.id == document_id).first()
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    get_accessible_project(document.project_id, user_id, db)
    return document


def clean_original_filename(filename: str | None) -> str:
    cleaned = Path((filename or "").replace("\\", "/")).name.strip()
    if not cleaned:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="PDF filename is required")
    if len(cleaned) > 255:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="PDF filename is too long")
    if Path(cleaned).suffix.lower() != ".pdf":
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="Only PDF files are allowed")
    return cleaned.replace("\r", "").replace("\n", "")


@router.get(
    "/api/projects/{project_id}/documents",
    response_model=list[DocumentResponse],
)
def list_project_documents(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[Document]:
    project = get_accessible_project(project_id, current_user.id, db)
    return (
        db.query(Document)
        .filter(Document.project_id == project.id)
        .order_by(Document.created_at.desc(), Document.id.desc())
        .all()
    )


@router.post(
    "/api/projects/{project_id}/documents",
    response_model=DocumentResponse,
    status_code=status.HTTP_201_CREATED,
)
async def upload_project_document(
    project_id: int,
    file: UploadFile = File(...),
    document_type: str = Form(...),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Document:
    project = get_accessible_project(project_id, current_user.id, db)
    ensure_project_active(project)
    cleaned_document_type = document_type.strip()
    if cleaned_document_type not in DOCUMENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Select a valid document type",
        )
    original_filename = clean_original_filename(file.filename)
    if file.content_type not in PDF_CONTENT_TYPES:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="File content type must be PDF",
        )

    project_directory = get_project_upload_directory(project.id)
    try:
        project_directory.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to prepare document storage",
        ) from exc
    destination = project_directory / f"{uuid4().hex}.pdf"
    total_size = 0

    try:
        first_chunk = await file.read(UPLOAD_CHUNK_SIZE)
        if not first_chunk.startswith(b"%PDF-"):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="File does not contain a valid PDF header",
            )

        with destination.open("xb") as stored_file:
            chunk = first_chunk
            while chunk:
                total_size += len(chunk)
                if total_size > MAX_PDF_SIZE:
                    raise HTTPException(
                        status_code=status.HTTP_413_CONTENT_TOO_LARGE,
                        detail="PDF must be 10 MB or smaller",
                    )
                stored_file.write(chunk)
                chunk = await file.read(UPLOAD_CHUNK_SIZE)
    except HTTPException:
        destination.unlink(missing_ok=True)
        remove_empty_project_directory(project.id)
        raise
    except OSError as exc:
        destination.unlink(missing_ok=True)
        remove_empty_project_directory(project.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to store PDF",
        ) from exc
    finally:
        await file.close()

    document = Document(
        project_id=project.id,
        file_name=original_filename,
        file_path=get_database_storage_path(destination),
        document_type=cleaned_document_type,
        uploaded_by=current_user.id,
    )
    db.add(document)
    try:
        db.commit()
        db.refresh(document)
    except SQLAlchemyError as exc:
        db.rollback()
        destination.unlink(missing_ok=True)
        remove_empty_project_directory(project.id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to save document metadata",
        ) from exc
    return document


@router.get("/api/documents/{document_id}/download")
def download_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> FileResponse:
    document = get_accessible_document(document_id, current_user.id, db)
    stored_file = get_stored_document_path(document.file_path)
    if stored_file is None or not stored_file.is_file():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document file not found")
    return FileResponse(
        path=stored_file,
        media_type="application/pdf",
        filename=document.file_name,
        content_disposition_type="inline",
        headers={"Cache-Control": "private, no-store"},
    )


@router.delete("/api/documents/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    document = get_accessible_document(document_id, current_user.id, db)
    ensure_project_active(document.project)
    if document.uploaded_by != current_user.id and document.project.created_by != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this document",
        )

    stored_file = get_stored_document_path(document.file_path)
    try:
        if stored_file is not None:
            stored_file.unlink(missing_ok=True)
        remove_empty_project_directory(document.project_id)
    except OSError as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to delete document file",
        ) from exc

    db.delete(document)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)
