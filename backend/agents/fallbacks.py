import os

from langchain_openai import ChatOpenAI
from tenacity import retry, stop_after_attempt, wait_exponential

from backend.config import settings
from backend.models import OutreachDraft

primary_llm = ChatOpenAI(
    model="gpt-4o-mini",
    api_key=settings.openai_api_key,
    temperature=0.3,
)

fallback_llm = ChatOpenAI(
    model="gpt-3.5-turbo",
    api_key=settings.openai_api_key,
    temperature=0.3,
)

llm_with_fallback = primary_llm.with_fallbacks([fallback_llm])


class OutreachError(Exception):
    pass


retry_llm = retry(
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=1, max=10),
    reraise=True,
)
