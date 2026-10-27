from fastapi import APIRouter, Request
from pydantic import BaseModel

from bottle_throne.config import Settings

router = APIRouter()


class FoundryHealth(BaseModel):
    api_key: bool
    endpoint: bool
    deployment: bool


class Health(BaseModel):
    foundry: FoundryHealth


@router.get("/health", response_model=Health)
def health(request: Request) -> Health:
    settings: Settings = request.app.state.settings
    presence = settings.foundry_presence()
    return Health(
        foundry=FoundryHealth(
            api_key=presence["FOUNDRY_API_KEY"],
            endpoint=presence["FOUNDRY_API_ENDPOINT"],
            deployment=presence["FOUNDRY_LLM_DEPLOYMENT_NAME"],
        )
    )
