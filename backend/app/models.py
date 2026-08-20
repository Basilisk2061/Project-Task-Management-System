from datetime import datetime

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Column,
    Date,
    DateTime,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import relationship

from app.database import Base
from app.constants import DEFAULT_DOCUMENT_TYPE


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    email = Column(String, nullable=False, unique=True, index=True)
    password_hash = Column(String, nullable=False)
    role = Column(String, nullable=False, default="user")
    professional_role = Column(String, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    created_projects = relationship("Project", back_populates="creator")
    project_memberships = relationship("ProjectMember", back_populates="user")
    created_tasks = relationship(
        "Task",
        foreign_keys="Task.created_by",
        back_populates="creator",
    )
    assigned_tasks = relationship(
        "Task",
        foreign_keys="Task.assigned_to",
        back_populates="assignee",
    )
    comments = relationship("Comment", back_populates="user")
    uploaded_documents = relationship("Document", back_populates="uploader")
    assistant_conversations = relationship("AssistantConversation", back_populates="creator")
    assistant_messages = relationship("AssistantMessage", back_populates="user")


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True)
    name = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    start_date = Column(Date, nullable=True)
    deadline = Column(Date, nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    creator = relationship("User", back_populates="created_projects")
    members = relationship("ProjectMember", back_populates="project")
    tasks = relationship("Task", back_populates="project")
    documents = relationship("Document", back_populates="project")
    assistant_conversations = relationship(
        "AssistantConversation",
        back_populates="project",
        cascade="all, delete-orphan",
    )
    assistant_messages = relationship(
        "AssistantMessage",
        back_populates="project",
        cascade="all, delete-orphan",
    )


class ProjectMember(Base):
    __tablename__ = "project_members"
    __table_args__ = (
        UniqueConstraint("project_id", "user_id", name="uq_project_member"),
    )

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    project = relationship("Project", back_populates="members")
    user = relationship("User", back_populates="project_memberships")


class Task(Base):
    __tablename__ = "tasks"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    title = Column(String, nullable=False)
    description = Column(Text, nullable=True)
    assigned_to = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    priority = Column(String, nullable=False, default="Medium")
    status = Column(String, nullable=False, default="To Do")
    due_date = Column(Date, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    project = relationship("Project", back_populates="tasks")
    creator = relationship(
        "User",
        foreign_keys=[created_by],
        back_populates="created_tasks",
    )
    assignee = relationship(
        "User",
        foreign_keys=[assigned_to],
        back_populates="assigned_tasks",
    )
    comments = relationship("Comment", back_populates="task")


class Comment(Base):
    __tablename__ = "comments"

    id = Column(Integer, primary_key=True)
    task_id = Column(Integer, ForeignKey("tasks.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    task = relationship("Task", back_populates="comments")
    user = relationship("User", back_populates="comments")


class Document(Base):
    __tablename__ = "documents"

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    file_name = Column(String, nullable=False)
    file_path = Column(String, nullable=False)
    document_type = Column(
        String,
        nullable=False,
        default=DEFAULT_DOCUMENT_TYPE,
        server_default=DEFAULT_DOCUMENT_TYPE,
    )
    uploaded_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    project = relationship("Project", back_populates="documents")
    uploader = relationship("User", back_populates="uploaded_documents")


class AssistantMessage(Base):
    __tablename__ = "assistant_messages"
    __table_args__ = (
        CheckConstraint("role IN ('user', 'assistant')", name="ck_assistant_message_role"),
        Index("ix_assistant_messages_project_created", "project_id", "created_at", "id"),
        Index("ix_assistant_messages_conversation_created", "conversation_id", "created_at", "id"),
    )

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    conversation_id = Column(Integer, ForeignKey("assistant_conversations.id"), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    grounded = Column(Boolean, nullable=True)
    sources_json = Column(Text, nullable=True)
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    project = relationship("Project", back_populates="assistant_messages")
    conversation = relationship("AssistantConversation", back_populates="messages")
    user = relationship("User", back_populates="assistant_messages")


class AssistantConversation(Base):
    __tablename__ = "assistant_conversations"
    __table_args__ = (
        Index("ix_assistant_conversations_project_updated", "project_id", "updated_at", "id"),
    )

    id = Column(Integer, primary_key=True)
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=False)
    created_by = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String, nullable=False, default="New Chat")
    created_at = Column(DateTime, nullable=False, default=datetime.utcnow)
    updated_at = Column(DateTime, nullable=False, default=datetime.utcnow)

    project = relationship("Project", back_populates="assistant_conversations")
    creator = relationship("User", back_populates="assistant_conversations")
    messages = relationship(
        "AssistantMessage",
        back_populates="conversation",
        cascade="all, delete-orphan",
    )
