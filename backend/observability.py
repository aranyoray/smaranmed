import logging

from langchain_core.callbacks import BaseCallbackHandler

logging.basicConfig(
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
    level=logging.INFO,
)
logger = logging.getLogger("smaran")


class TokenTracker(BaseCallbackHandler):
    def __init__(self):
        self.total_tokens = 0
        self.calls = 0

    def on_llm_end(self, response, **kwargs):
        usage = getattr(response, "llm_output", None) or {}
        if isinstance(usage, dict):
            usage = usage.get("token_usage", {})
            self.total_tokens += usage.get("total_tokens", 0)
        self.calls += 1


tracker = TokenTracker()
