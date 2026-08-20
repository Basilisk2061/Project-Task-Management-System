from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator

from app.constants import PROFESSIONAL_ROLES


class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)
    professional_role: str

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned_name = value.strip()
        if not cleaned_name:
            raise ValueError("Name is required")
        return cleaned_name

    @field_validator("professional_role")
    @classmethod
    def validate_professional_role(cls, value: str) -> str:
        cleaned_role = value.strip()
        if cleaned_role not in PROFESSIONAL_ROLES:
            raise ValueError("Select a valid professional role")
        return cleaned_role


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    role: str
    professional_role: str | None


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class ProjectCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str | None = None
    start_date: date | None = None
    deadline: date | None = None

    @field_validator("name")
    @classmethod
    def clean_project_name(cls, value: str) -> str:
        cleaned_name = value.strip()
        if not cleaned_name:
            raise ValueError("Project name is required")
        return cleaned_name

    @model_validator(mode="after")
    def validate_dates(self):
        if self.start_date and self.deadline and self.deadline < self.start_date:
            raise ValueError("Deadline cannot be before start date")
        return self


class ProjectUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    start_date: date | None = None
    deadline: date | None = None

    @field_validator("name")
    @classmethod
    def clean_updated_project_name(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Project name is required")
        cleaned_name = value.strip()
        if not cleaned_name:
            raise ValueError("Project name is required")
        return cleaned_name


class ProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    description: str | None
    start_date: date | None
    deadline: date | None
    created_by: int
    created_at: datetime


class ProjectMemberCreate(BaseModel):
    user_id: int


class ProjectMemberResponse(BaseModel):
    membership_id: int | None
    user_id: int
    name: str
    email: EmailStr
    role: str
    professional_role: str | None


class UserSearchResponse(BaseModel):
    id: int
    name: str
    email: EmailStr
    professional_role: str | None


class TaskUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    professional_role: str | None


class TaskProjectResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    created_by: int


class TaskCreate(BaseModel):
    title: str = Field(min_length=1, max_length=200)
    description: str | None = None
    priority: Literal["low", "medium", "high"] = "medium"
    due_date: date | None = None
    assigned_to: int | None = None

    @field_validator("title")
    @classmethod
    def clean_task_title(cls, value: str) -> str:
        cleaned_title = value.strip()
        if not cleaned_title:
            raise ValueError("Task title is required")
        return cleaned_title


class TaskUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    priority: Literal["low", "medium", "high"] | None = None
    due_date: date | None = None
    assigned_to: int | None = None

    @field_validator("title")
    @classmethod
    def clean_updated_task_title(cls, value: str | None) -> str | None:
        if value is None:
            raise ValueError("Task title is required")
        cleaned_title = value.strip()
        if not cleaned_title:
            raise ValueError("Task title is required")
        return cleaned_title

    @field_validator("priority")
    @classmethod
    def require_updated_priority(cls, value: str | None) -> str:
        if value is None:
            raise ValueError("Task priority is required")
        return value


class TaskStatusUpdate(BaseModel):
    status: Literal["todo", "in_progress", "completed"]


class TaskResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    title: str
    description: str | None
    assigned_to: int | None
    created_by: int
    priority: Literal["low", "medium", "high"]
    status: Literal["todo", "in_progress", "completed"]
    due_date: date | None
    created_at: datetime
    project: TaskProjectResponse
    creator: TaskUserResponse
    assignee: TaskUserResponse | None


class CommentCreate(BaseModel):
    content: str = Field(min_length=1, max_length=2000)

    @field_validator("content", mode="before")
    @classmethod
    def clean_comment_content(cls, value: str) -> str:
        if not isinstance(value, str):
            return value
        cleaned_content = value.strip()
        if not cleaned_content:
            raise ValueError("Comment cannot be empty")
        return cleaned_content


class CommentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    task_id: int
    content: str
    created_at: datetime
    author: TaskUserResponse = Field(validation_alias="user")


class DocumentResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    file_name: str
    document_type: str
    uploaded_by: int
    created_at: datetime
    uploader: TaskUserResponse


class RagChunkPreview(BaseModel):
    chunk_index: int
    preview: str


class RagDocumentInspection(BaseModel):
    document_id: int
    file_name: str
    status: Literal["processed", "no_extractable_text", "unreadable_pdf", "file_missing"]
    character_count: int
    chunk_count: int
    message: str | None = None
    chunks: list[RagChunkPreview]


class RagProjectInspectionResponse(BaseModel):
    project_id: int
    document_count: int
    total_chunks: int
    documents: list[RagDocumentInspection]


class RagIndexBuildResponse(BaseModel):
    project_id: int
    documents_processed: int
    chunks_indexed: int
    embedding_model: str
    vector_dimension: int
    status: Literal["ready"]


class RagStatusResponse(BaseModel):
    status: Literal["ready", "missing", "stale"]


class RagSearchRequest(BaseModel):
    question: str = Field(min_length=1, max_length=1000)

    @field_validator("question", mode="before")
    @classmethod
    def clean_question(cls, value: str) -> str:
        if not isinstance(value, str):
            return value
        cleaned_question = value.strip()
        if not cleaned_question:
            raise ValueError("Question cannot be empty")
        return cleaned_question


class RagSearchResult(BaseModel):
    rank: int
    document_id: int
    file_name: str
    chunk_index: int
    score: float
    text: str


class RagSearchResponse(BaseModel):
    project_id: int
    question: str
    top_k: int
    results: list[RagSearchResult]


class RagAskRequest(RagSearchRequest):
    pass


class RagAskSource(BaseModel):
    source_number: int
    document_id: int
    file_name: str
    chunk_index: int


class RagAskResponse(BaseModel):
    project_id: int
    question: str
    answer: str
    grounded: bool
    sources: list[RagAskSource]


class AssistantHistoryUser(BaseModel):
    id: int
    name: str


class AssistantHistorySource(BaseModel):
    document_id: int | None
    file_name: str


class AssistantHistoryMessageResponse(BaseModel):
    id: int
    role: Literal["user", "assistant"]
    content: str
    grounded: bool | None
    sources: list[AssistantHistorySource]
    created_at: datetime
    user: AssistantHistoryUser


class AssistantConversationCreator(BaseModel):
    id: int
    name: str


class AssistantConversationResponse(BaseModel):
    id: int
    project_id: int
    created_by: int
    title: str
    created_at: datetime
    updated_at: datetime
    creator: AssistantConversationCreator


class RagConversationAskResponse(RagAskResponse):
    conversation: AssistantConversationResponse
