import logging

import pytest

from bottle_throne.logging_utils import MASK, install_secret_masking

SECRET = "sk-logged-secret-456"


def test_message_masked(caplog: pytest.LogCaptureFixture) -> None:
    install_secret_masking([SECRET])
    logger = logging.getLogger("bottle_throne.test.message")

    with caplog.at_level(logging.INFO):
        logger.info("connecting with key %s", SECRET)

    assert SECRET not in caplog.text
    assert MASK in caplog.text


def test_exception_traceback_masked(caplog: pytest.LogCaptureFixture) -> None:
    install_secret_masking([SECRET])
    logger = logging.getLogger("bottle_throne.test.exception")

    with caplog.at_level(logging.ERROR):
        try:
            raise RuntimeError(f"authentication failed for key {SECRET}")
        except RuntimeError:
            logger.exception("configuration error")

    assert "RuntimeError" in caplog.text
    assert SECRET not in caplog.text
    assert MASK in caplog.text


def test_third_party_logger_masked(caplog: pytest.LogCaptureFixture) -> None:
    install_secret_masking([SECRET])
    logger = logging.getLogger("uvicorn.error")

    with caplog.at_level(logging.WARNING, logger="uvicorn.error"):
        logger.warning("header Authorization: %s", SECRET)

    assert SECRET not in caplog.text


def test_app_creation_installs_masking(caplog: pytest.LogCaptureFixture) -> None:
    from bottle_throne.app import create_app
    from bottle_throne.config import Settings

    other_secret = "sk-from-settings-789"
    create_app(Settings(_env_file=None, FOUNDRY_API_KEY=other_secret))
    logger = logging.getLogger("bottle_throne.test.app")

    with caplog.at_level(logging.INFO):
        logger.info("key=%s", other_secret)

    assert other_secret not in caplog.text
