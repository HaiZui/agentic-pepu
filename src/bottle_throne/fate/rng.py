import hashlib
import hmac
from collections.abc import Sequence
from typing import TypeVar

T = TypeVar("T")


class Stream:
    """Deterministic random stream: HMAC-SHA256(seed, label || 0x00 || counter) in counter mode.

    Integers are drawn by rejection sampling, so there is no modulo bias. Streams with different
    labels are independent, so changing how one stream is consumed cannot shift another.
    """

    def __init__(self, seed: str, label: str) -> None:
        self._key = seed.encode("utf-8")
        self._label = label.encode("utf-8")
        self._counter = 0
        self._buffer = b""

    def _block(self) -> bytes:
        message = self._label + b"\x00" + self._counter.to_bytes(8, "big")
        self._counter += 1
        return hmac.new(self._key, message, hashlib.sha256).digest()

    def read(self, count: int) -> bytes:
        while len(self._buffer) < count:
            self._buffer += self._block()
        out, self._buffer = self._buffer[:count], self._buffer[count:]
        return out

    def uniform_int(self, n: int) -> int:
        """Uniform integer in [0, n)."""
        if n <= 0:
            raise ValueError("n must be positive")
        if n == 1:
            return 0
        bits = (n - 1).bit_length()
        nbytes = (bits + 7) // 8
        mask = (1 << bits) - 1
        while True:
            value = int.from_bytes(self.read(nbytes), "big") & mask
            if value < n:
                return value

    def choice(self, items: Sequence[T]) -> T:
        if not items:
            raise ValueError("cannot choose from an empty sequence")
        return items[self.uniform_int(len(items))]

    def shuffle(self, items: Sequence[T]) -> list[T]:
        result = list(items)
        for i in range(len(result) - 1, 0, -1):
            j = self.uniform_int(i + 1)
            result[i], result[j] = result[j], result[i]
        return result

    def sample(self, items: Sequence[T], k: int) -> list[T]:
        if k > len(items):
            raise ValueError("sample larger than population")
        return self.shuffle(items)[:k]

    def chance(self, numerator: int, denominator: int) -> bool:
        return self.uniform_int(denominator) < numerator

    def weighted_choice(self, items: Sequence[T], weights: Sequence[int]) -> T:
        total = sum(weights)
        if total <= 0:
            raise ValueError("weights must sum to a positive value")
        r = self.uniform_int(total)
        for item, weight in zip(items, weights, strict=True):
            if r < weight:
                return item
            r -= weight
        raise AssertionError("unreachable")
