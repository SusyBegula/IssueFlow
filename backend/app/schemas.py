from datetime import date
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, SecretStr, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


Color = Literal["violet", "peach", "mint", "rose", "blue"]
Status = Literal["todo", "in_progress", "blocked", "done"]
Priority = Literal["low", "medium", "high", "urgent"]


class ProjectInput(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    description: str = Field(default="", max_length=2000)
    code: str = Field(min_length=2, max_length=6, pattern=r"^[A-Z0-9]+$")
    color: Color = "violet"


class IssueCreate(StrictModel):
    project_id: UUID
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    status: Status = "todo"
    priority: Priority = "medium"
    assignee_id: UUID | None = None
    label: str = Field(default="General", max_length=40)
    due_date: date | None = None


class IssuePatch(StrictModel):
    title: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = Field(default=None, max_length=10000)
    status: Status | None = None
    priority: Priority | None = None
    assignee_id: UUID | None = None
    label: str | None = Field(default=None, max_length=40)
    due_date: date | None = None

    @field_validator("title", "description", "status", "priority", "label", mode="before")
    @classmethod
    def disallow_explicit_null(cls, value):
        if value is None:
            raise ValueError("This field cannot be null")
        return value


class ProfileInput(StrictModel):
    name: str = Field(min_length=1, max_length=100)
    color: Color | None = None
    avatar_url: str | None = Field(default=None, max_length=2_800_000)

    @field_validator("color", mode="before")
    @classmethod
    def color_not_null(cls, value):
        if value is None:
            raise ValueError("Choose an avatar color")
        return value


class MemberInput(StrictModel):
    username: str = Field(min_length=1, max_length=100)


class LoginInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    username: str = Field(min_length=1, max_length=100)
    password: SecretStr = Field(min_length=1, max_length=128)

