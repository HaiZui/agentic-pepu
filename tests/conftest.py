import os

# The comic job launches a headless browser; tests opt in explicitly (see tests/comic).
os.environ.setdefault("BOTTLE_THRONE_COMIC", "0")
