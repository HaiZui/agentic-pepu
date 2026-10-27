"""`python -m bottle_throne llm-check`: one tiny request to the configured deployment."""

from pydantic import BaseModel

from bottle_throne.config import Settings
from bottle_throne.story.llm import LLMError, create_llm, resource_root

HINTS = {
    "config": "Check FOUNDRY_API_ENDPOINT, FOUNDRY_API_KEY and FOUNDRY_LLM_DEPLOYMENT_NAME in .env.",
    "auth": "The key was rejected. Copy the key of this Foundry resource into FOUNDRY_API_KEY.",
    "not_found": "Check FOUNDRY_LLM_DEPLOYMENT_NAME. If the endpoint only serves the dated API, "
    "set FOUNDRY_API_VERSION (for example 2024-10-21).",
    "network": "The endpoint could not be reached. Check the network and FOUNDRY_API_ENDPOINT.",
    "timeout": "The deployment did not answer within the time limit.",
}


class _Ping(BaseModel):
    ok: bool
    word: str


async def llm_check(settings: Settings) -> tuple[bool, list[str]]:
    """Returns (success, report lines). Never includes the API key."""
    missing = settings.missing_foundry_variables()
    if missing:
        return False, [f"FAIL config: missing {', '.join(missing)}", HINTS["config"]]
    try:
        llm = create_llm(settings)
        assert llm is not None and settings.foundry_api_endpoint
        lines = [
            f"Endpoint:   {resource_root(settings.foundry_api_endpoint)} ({llm.mode} API)",
            f"Deployment: {llm.deployment}",
        ]
        reply = await llm.json(
            [
                {"role": "system", "content": "You are a connectivity check for a raffle app."},
                {"role": "user", "content": "Answer with ok=true and word='throne'."},
            ],
            _Ping,
            temperature=0,
            timeout=30,
        )
    except LLMError as error:
        return False, [f"FAIL {error.kind}: {error}", HINTS.get(error.kind, "")]
    mode = "strict JSON schema" if llm.strict_schema else "json_object (strict JSON schema not supported)"
    temperature = "custom" if llm.custom_temperature else "model default only"
    lines += [
        f"Structured output: {mode}",
        f"Temperature: {temperature}",
        f"Reasoning effort: {llm.reasoning_effort or 'not supported'}",
        f"Reply: ok={reply.ok} word={reply.word!r}",
        "OK",
    ]
    return True, lines
