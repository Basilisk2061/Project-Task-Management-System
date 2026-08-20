import json
import re

from sqlalchemy.orm import Session

from app.models import AssistantMessage


CONVERSATION_MEMORY_MESSAGES = 6
RETRIEVAL_CONTEXT_MESSAGES = 2
RETRIEVAL_TOPIC_CHARACTERS = 500
RETRIEVAL_SOURCE_FILES = 3
CONVERSATION_TITLE_MAX_LENGTH = 48
NEW_CONVERSATION_TITLE = "New Chat"

CONTEXT_REFERENCE_PATTERNS = (
    re.compile(r"\bit\b", re.IGNORECASE),
    re.compile(r"\bthat\b", re.IGNORECASE),
    re.compile(r"\b(?:they|them)\b", re.IGNORECASE),
    re.compile(r"\b(?:this|that|the)\s+(?:document|file|one)\b", re.IGNORECASE),
    re.compile(r"\b(?:those|these|the)\s+(?:notes|documents|files|requirements)\b", re.IGNORECASE),
    re.compile(r"\b(?:the\s+)?other\s+(?:one|document|file)\b", re.IGNORECASE),
    re.compile(r"\bwhat\s+about\b", re.IGNORECASE),
    re.compile(r"\bthis\b(?=\s*[?.!,]?\s*$)", re.IGNORECASE),
)

FOLLOWUP_INTENT_HINTS = (
    (
        re.compile(r"^\s*(?:who|whose)\b", re.IGNORECASE),
        "Project task responsibilities: who is assigned to implement the referenced work?",
    ),
    (
        re.compile(r"^\s*(?:when|by\s+when)\b", re.IGNORECASE),
        "Search for timing, deadlines, schedules, milestones, or completion requirements.",
    ),
    (
        re.compile(r"\b(?:what\s+happens?\s+next|what\s+should\s+happen\s+after|next\s+step)\b", re.IGNORECASE),
        "Search for next steps, follow-up actions, review milestones, or completion sequence.",
    ),
)

TOPIC_INTENT_HINTS = (
    (
        re.compile(r"\b(?:responsib\w*|implement\w*|assigned\w*)\b", re.IGNORECASE),
        "Project task responsibilities: who is assigned to implement each part of the work?",
    ),
    (
        re.compile(r"\b(?:test\w*|quality\s+assurance|browser\s+coverage)\b", re.IGNORECASE),
        "Testing requirements, QA responsibilities, validation, and browser or device coverage.",
    ),
)


def load_recent_conversation(
    db: Session,
    project_id: int,
    conversation_id: int,
) -> list[AssistantMessage]:
    recent = (
        db.query(AssistantMessage)
        .filter(
            AssistantMessage.project_id == project_id,
            AssistantMessage.conversation_id == conversation_id,
        )
        .order_by(AssistantMessage.created_at.desc(), AssistantMessage.id.desc())
        .limit(CONVERSATION_MEMORY_MESSAGES)
        .all()
    )
    return list(reversed(recent))


def derive_conversation_title(question: str) -> str:
    title = " ".join(question.split()).strip()
    if len(title) <= CONVERSATION_TITLE_MAX_LENGTH:
        return title or NEW_CONVERSATION_TITLE
    return f"{title[:CONVERSATION_TITLE_MAX_LENGTH - 3].rstrip()}..."


def conversation_as_prompt_messages(messages: list[AssistantMessage]) -> list[dict[str, str]]:
    return [{"role": message.role, "content": message.content} for message in messages]


def conversation_as_retrieval_messages(messages: list[AssistantMessage]) -> list[dict]:
    return [
        {
            "role": message.role,
            "content": message.content,
            "grounded": message.grounded,
            "source_file_names": [
                source["file_name"]
                for source in deserialize_safe_sources(message.sources_json)
            ],
        }
        for message in messages
    ]


def is_context_dependent_question(question: str) -> bool:
    cleaned_question = " ".join(question.split())
    return any(pattern.search(cleaned_question) for pattern in CONTEXT_REFERENCE_PATTERNS)


def _compact_context(value: str, character_limit: int) -> str:
    compact = " ".join(value.split())
    if len(compact) <= character_limit:
        return compact
    return f"{compact[:character_limit - 3].rstrip()}..."


def build_contextualized_retrieval_query(
    question: str,
    conversation: list[dict],
) -> str:
    if not is_context_dependent_question(question):
        return question

    recent = conversation[-RETRIEVAL_CONTEXT_MESSAGES:]
    previous_user = next(
        (message for message in reversed(recent) if message.get("role") == "user"),
        None,
    )
    previous_assistant = next(
        (message for message in reversed(recent) if message.get("role") == "assistant"),
        None,
    )
    source_file_names = []
    if previous_assistant:
        source_file_names = list(dict.fromkeys(
            previous_assistant.get("source_file_names", [])
        ))[:RETRIEVAL_SOURCE_FILES]

    context_lines = []
    if source_file_names:
        context_lines.append(
            "Referenced project document(s): " + ", ".join(source_file_names)
        )
    if previous_user and previous_user.get("content", "").strip():
        context_lines.append(
            "Previous topic: "
            + _compact_context(previous_user["content"], RETRIEVAL_TOPIC_CHARACTERS)
        )
    intent_hint = next(
        (hint for pattern, hint in FOLLOWUP_INTENT_HINTS if pattern.search(question)),
        None,
    )
    if intent_hint:
        context_lines.append(intent_hint)
    previous_topic = previous_user.get("content", "") if previous_user else ""
    topic_hint = next(
        (hint for pattern, hint in TOPIC_INTENT_HINTS if pattern.search(previous_topic)),
        None,
    )
    if topic_hint and topic_hint != intent_hint:
        context_lines.append(topic_hint)

    if not context_lines:
        return question
    context_lines.append(f"Current follow-up question: {question}")
    return "\n".join(context_lines)


def serialize_safe_sources(sources: list[dict]) -> str | None:
    deduplicated = {}
    for source in sources:
        document_id = source.get("document_id")
        file_name = str(source.get("file_name", "")).strip()
        if not file_name:
            continue
        key = document_id if document_id is not None else f"file:{file_name}"
        deduplicated[key] = {"document_id": document_id, "file_name": file_name}
    if not deduplicated:
        return None
    return json.dumps(list(deduplicated.values()), ensure_ascii=False)


def deserialize_safe_sources(sources_json: str | None) -> list[dict]:
    if not sources_json:
        return []
    try:
        sources = json.loads(sources_json)
    except (TypeError, json.JSONDecodeError):
        return []
    if not isinstance(sources, list):
        return []
    safe_sources = []
    seen = set()
    for source in sources:
        if not isinstance(source, dict):
            continue
        document_id = source.get("document_id")
        file_name = source.get("file_name")
        if not isinstance(file_name, str) or not file_name.strip():
            continue
        if document_id is not None and not isinstance(document_id, int):
            continue
        key = document_id if document_id is not None else f"file:{file_name}"
        if key in seen:
            continue
        seen.add(key)
        safe_sources.append({"document_id": document_id, "file_name": file_name.strip()})
    return safe_sources
