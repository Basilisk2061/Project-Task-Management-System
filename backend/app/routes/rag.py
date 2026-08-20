from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user
from app.database import get_db
from app.migrations import LEGACY_ASSISTANT_CONVERSATION_TITLE
from app.models import AssistantConversation, AssistantMessage, Document, User
from app.project_lifecycle import ensure_project_active
from app.rag.conversation import (
    build_contextualized_retrieval_query,
    conversation_as_prompt_messages,
    conversation_as_retrieval_messages,
    deserialize_safe_sources,
    derive_conversation_title,
    load_recent_conversation,
    NEW_CONVERSATION_TITLE,
    serialize_safe_sources,
)
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
    get_project_index_status,
    search_project_index,
)
from app.routes.projects import get_accessible_project
from app.schemas import (
    AssistantHistoryMessageResponse,
    AssistantConversationResponse,
    RagAskRequest,
    RagAskResponse,
    RagConversationAskResponse,
    RagIndexBuildResponse,
    RagProjectInspectionResponse,
    RagSearchRequest,
    RagSearchResponse,
    RagStatusResponse,
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


def assistant_message_response(message: AssistantMessage) -> dict:
    return {
        "id": message.id,
        "role": message.role,
        "content": message.content,
        "grounded": message.grounded,
        "sources": deserialize_safe_sources(message.sources_json),
        "created_at": message.created_at,
        "user": {"id": message.user.id, "name": message.user.name},
    }


def assistant_conversation_response(conversation: AssistantConversation) -> dict:
    return {
        "id": conversation.id,
        "project_id": conversation.project_id,
        "created_by": conversation.created_by,
        "title": conversation.title,
        "created_at": conversation.created_at,
        "updated_at": conversation.updated_at,
        "creator": {"id": conversation.creator.id, "name": conversation.creator.name},
    }


def get_accessible_conversation(
    project_id: int,
    conversation_id: int,
    user_id: int,
    db: Session,
) -> tuple[object, AssistantConversation]:
    project = get_accessible_project(project_id, user_id, db)
    conversation = (
        db.query(AssistantConversation)
        .options(joinedload(AssistantConversation.creator))
        .filter(
            AssistantConversation.id == conversation_id,
            AssistantConversation.project_id == project.id,
        )
        .first()
    )
    if conversation is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Conversation not found")
    return project, conversation


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


@router.get(
    "/api/projects/{project_id}/rag/status",
    response_model=RagStatusResponse,
)
def read_project_index_status(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    project = get_accessible_project(project_id, current_user.id, db)
    documents = get_project_documents(project.id, db)
    try:
        index_status = get_project_index_status(project.id, documents)
    except ProjectIndexStorageError as exc:
        raise_rag_http_error(exc)
    return {"status": index_status}


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
    ensure_project_active(project)
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


def answer_project_conversation(
    project_id: int,
    conversation_id: int,
    data: RagAskRequest,
    current_user: User,
    db: Session,
) -> dict:
    project, conversation = get_accessible_conversation(
        project_id,
        conversation_id,
        current_user.id,
        db,
    )
    current_user_id = current_user.id
    documents = get_project_documents(project.id, db)
    recent_messages = load_recent_conversation(db, project.id, conversation.id)
    conversation_memory = conversation_as_prompt_messages(recent_messages)
    retrieval_context = conversation_as_retrieval_messages(recent_messages)
    retrieval_query = build_contextualized_retrieval_query(
        data.question,
        retrieval_context,
    )

    # The provider calls do not need an open database transaction. Detaching the
    # already-loaded values also lets access be checked again after inference.
    db.expunge_all()
    db.rollback()
    try:
        retrieved_chunks = search_project_index(project_id, documents, retrieval_query)
        generated = generate_grounded_answer(
            data.question,
            retrieved_chunks,
            conversation_history=conversation_memory,
            retrieval_context=retrieval_query,
        )
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

    _, conversation = get_accessible_conversation(
        project_id,
        conversation_id,
        current_user_id,
        db,
    )

    selected_sources = []
    for source_number in generated["source_numbers"]:
        chunk = retrieved_chunks[source_number - 1]
        selected_sources.append({
            "source_number": source_number,
            "document_id": chunk["document_id"],
            "file_name": chunk["file_name"],
            "chunk_index": chunk["chunk_index"],
        })
    user_message = AssistantMessage(
        project_id=project_id,
        conversation_id=conversation_id,
        user_id=current_user_id,
        role="user",
        content=data.question,
    )
    assistant_message = AssistantMessage(
        project_id=project_id,
        conversation_id=conversation_id,
        user_id=current_user_id,
        role="assistant",
        content=generated["answer"],
        grounded=generated["grounded"],
        sources_json=serialize_safe_sources(selected_sources),
    )
    if conversation.title == NEW_CONVERSATION_TITLE:
        conversation.title = derive_conversation_title(data.question)
    conversation.updated_at = datetime.utcnow()
    db.add_all([user_message, assistant_message])
    try:
        db.commit()
    except SQLAlchemyError as exc:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Unable to save the Project Assistant conversation",
        ) from exc

    return {
        "project_id": project_id,
        "question": data.question,
        "answer": generated["answer"],
        "grounded": generated["grounded"],
        "sources": selected_sources,
        "conversation": assistant_conversation_response(conversation),
    }


@router.get(
    "/api/projects/{project_id}/rag/conversations",
    response_model=list[AssistantConversationResponse],
)
def list_project_assistant_conversations(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    project = get_accessible_project(project_id, current_user.id, db)
    conversations = (
        db.query(AssistantConversation)
        .options(joinedload(AssistantConversation.creator))
        .filter(AssistantConversation.project_id == project.id)
        .order_by(AssistantConversation.updated_at.desc(), AssistantConversation.id.desc())
        .all()
    )
    return [assistant_conversation_response(conversation) for conversation in conversations]


@router.post(
    "/api/projects/{project_id}/rag/conversations",
    response_model=AssistantConversationResponse,
    status_code=status.HTTP_201_CREATED,
)
def create_project_assistant_conversation(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    project = get_accessible_project(project_id, current_user.id, db)
    conversation = AssistantConversation(
        project_id=project.id,
        created_by=current_user.id,
        title=NEW_CONVERSATION_TITLE,
    )
    db.add(conversation)
    db.commit()
    db.refresh(conversation)
    return assistant_conversation_response(conversation)


@router.get(
    "/api/projects/{project_id}/rag/conversations/{conversation_id}/history",
    response_model=list[AssistantHistoryMessageResponse],
)
def read_conversation_history(
    project_id: int,
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    _, conversation = get_accessible_conversation(
        project_id,
        conversation_id,
        current_user.id,
        db,
    )
    messages = (
        db.query(AssistantMessage)
        .options(joinedload(AssistantMessage.user))
        .filter(
            AssistantMessage.project_id == project_id,
            AssistantMessage.conversation_id == conversation.id,
        )
        .order_by(AssistantMessage.created_at.asc(), AssistantMessage.id.asc())
        .all()
    )
    return [assistant_message_response(message) for message in messages]


@router.post(
    "/api/projects/{project_id}/rag/conversations/{conversation_id}/ask",
    response_model=RagConversationAskResponse,
)
def ask_conversation(
    project_id: int,
    conversation_id: int,
    data: RagAskRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    return answer_project_conversation(
        project_id,
        conversation_id,
        data,
        current_user,
        db,
    )


@router.delete(
    "/api/projects/{project_id}/rag/conversations/{conversation_id}",
    status_code=status.HTTP_204_NO_CONTENT,
)
def delete_conversation(
    project_id: int,
    conversation_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> Response:
    project, conversation = get_accessible_conversation(
        project_id,
        conversation_id,
        current_user.id,
        db,
    )
    if current_user.id != project.created_by and current_user.id != conversation.created_by:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this conversation",
        )
    db.query(AssistantMessage).filter(
        AssistantMessage.conversation_id == conversation.id
    ).delete(synchronize_session=False)
    db.delete(conversation)
    db.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def get_or_create_legacy_conversation(
    project_id: int,
    user_id: int,
    db: Session,
) -> AssistantConversation:
    project = get_accessible_project(project_id, user_id, db)
    conversation = (
        db.query(AssistantConversation)
        .filter(
            AssistantConversation.project_id == project.id,
            AssistantConversation.title == LEGACY_ASSISTANT_CONVERSATION_TITLE,
        )
        .order_by(AssistantConversation.id.asc())
        .first()
    )
    if conversation is None:
        conversation = AssistantConversation(
            project_id=project.id,
            created_by=user_id,
            title=LEGACY_ASSISTANT_CONVERSATION_TITLE,
        )
        db.add(conversation)
        db.commit()
        db.refresh(conversation)
    return conversation


@router.post("/api/projects/{project_id}/rag/ask", response_model=RagAskResponse)
def ask_project_documents(
    project_id: int,
    data: RagAskRequest,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> dict:
    conversation = get_or_create_legacy_conversation(project_id, current_user.id, db)
    result = answer_project_conversation(
        project_id,
        conversation.id,
        data,
        current_user,
        db,
    )
    result.pop("conversation", None)
    return result


@router.get(
    "/api/projects/{project_id}/rag/history",
    response_model=list[AssistantHistoryMessageResponse],
)
def read_project_assistant_history(
    project_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> list[dict]:
    conversation = get_or_create_legacy_conversation(project_id, current_user.id, db)
    return read_conversation_history(
        project_id,
        conversation.id,
        current_user,
        db,
    )
