"""LLM fallbacks for replies and search, used only when keyword rules find nothing."""

from __future__ import annotations

from typing import Literal, Optional

from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from backend.agents.fallbacks import llm_with_fallback
from backend.models import SearchFilters
from backend.observability import tracker

Intent = Literal["escalate", "deceased", "opt_out", "wrong_number", "moved", "elsewhere", "callback", "coming", "unclear"]


class ReplyIntent(BaseModel):
    intent: Intent = Field(description="What the patient's reply means for follow-up")


REPLY_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """You sort patient replies to a diabetes clinic's follow-up reminder.
The reply may be English, Bengali, or a mix.
- escalate: any symptom, medicine or dose question, pregnancy, or anything a doctor must read
- deceased, opt_out, wrong_number, moved, elsewhere (tested at another lab or doctor)
- callback: wants a call later; coming: will visit or wants to book
- unclear: anything else
When in doubt between escalate and anything else, choose escalate."""),
    ("human", "{text}"),
])

SEARCH_PROMPT = ChatPromptTemplate.from_messages([
    ("system", """Turn a care coordinator's request into queue filters.
statuses: any of overdue, slipping, due. critical: high priority or escalated.
reachable: has a usable phone. due_within_days: 0 today, 7 this week, 30 this month.
lang: bn or en. Ages are whole years. Leave anything not asked for empty.
Filter on scheduling only. Never on lab values or diagnoses."""),
    ("human", "{text}"),
])


def llm_classify_reply(text: str) -> Optional[str]:
    chain = REPLY_PROMPT | llm_with_fallback.with_structured_output(ReplyIntent)
    return chain.invoke({"text": text}, config={"callbacks": [tracker]}).intent


def llm_parse_query(text: str) -> dict:
    chain = SEARCH_PROMPT | llm_with_fallback.with_structured_output(SearchFilters)
    return chain.invoke({"text": text}, config={"callbacks": [tracker]}).model_dump()
