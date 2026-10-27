import logging
import threading

MASK = "***"


class SecretMaskingFilter(logging.Filter):
    """Replaces secret values in a log record's message, traceback and stack text."""

    def __init__(self, secrets: list[str] | None = None) -> None:
        super().__init__()
        self._secrets: list[str] = []
        self.set_secrets(secrets or [])

    def set_secrets(self, secrets: list[str]) -> None:
        self._secrets = sorted({s for s in secrets if s}, key=len, reverse=True)

    def mask(self, text: str) -> str:
        for secret in self._secrets:
            text = text.replace(secret, MASK)
        return text

    def filter(self, record: logging.LogRecord) -> bool:
        if not self._secrets:
            return True
        try:
            message = record.getMessage()
        except Exception:
            message = str(record.msg)
        masked = self.mask(message)
        if masked != message:
            record.msg, record.args = masked, ()
        if record.exc_info and not record.exc_text:
            record.exc_text = logging.Formatter().formatException(record.exc_info)
        if record.exc_text:
            record.exc_text = self.mask(record.exc_text)
        if record.stack_info:
            record.stack_info = self.mask(record.stack_info)
        return True


_filter = SecretMaskingFilter()
_install_lock = threading.Lock()
_installed = False


def install_secret_masking(secrets: list[str]) -> SecretMaskingFilter:
    """Mask the given secrets in every log record created from now on, by any logger."""
    global _installed
    with _install_lock:
        _filter.set_secrets(secrets)
        if not _installed:
            previous_factory = logging.getLogRecordFactory()

            def masking_factory(*args, **kwargs) -> logging.LogRecord:
                record = previous_factory(*args, **kwargs)
                _filter.filter(record)
                return record

            logging.setLogRecordFactory(masking_factory)
            _installed = True
    return _filter
