from fastapi import APIRouter

from bottle_throne.story.catalog import CATALOG, Catalog

router = APIRouter(tags=["story"])


@router.get("/catalog", response_model=Catalog)
def get_catalog() -> Catalog:
    return CATALOG
