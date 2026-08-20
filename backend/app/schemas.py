from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, EmailStr, Field, field_validator, model_validator


class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str) -> str:
        cleaned_name = value.strip()
        if not cleaned_name:
            raise ValueError("Name is required")
        return cleaned_name


class UserLogin(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    email: EmailStr
    role: str


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


class UserSearchResponse(BaseModel):
    id: int
    name: str
    email: EmailStr


class TaskUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str


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
