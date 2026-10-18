"""Small shared protocol helpers. No OS control belongs in the worker."""

from datetime import datetime, timezone
import re
import time
import uuid

SCHEMA_VERSION = 1
MAX_LINE_BYTES = 256 * 1024
MAX_PROCESSES = 256
MAX_APPS = 100


def utc_now():
    return datetime.now(timezone.utc).isoformat(timespec='milliseconds').replace('+00:00', 'Z')


def monotonic_ms():
    return int(time.monotonic() * 1000)


def new_id():
    return str(uuid.uuid4())


def process_key(process):
    return (process['uid'], process['pid'], process['start_ticks'])


def valid_text(value, maximum=128):
    return isinstance(value, str) and 0 < len(value) <= maximum and all(
        character.isprintable() for character in value)


def valid_id(value):
    return valid_text(value) and re.fullmatch(r'[A-Za-z0-9_.@:+-]+', value) is not None


def integer(value, minimum=0):
    return isinstance(value, int) and not isinstance(value, bool) and value >= minimum
