from __future__ import annotations

from collections.abc import Callable
from threading import Event, Lock


class GenerationHandle:
    """Thread-safe cancellation state for one active generation."""

    def __init__(self) -> None:
        self._event = Event()
        self._lock = Lock()
        self._close_stream: Callable[[], None] | None = None

    @property
    def cancelled(self) -> bool:
        return self._event.is_set()

    def attach_stream_closer(
        self,
        closer: Callable[[], None],
    ) -> None:
        should_close = False

        with self._lock:
            if self._event.is_set():
                should_close = True
            else:
                self._close_stream = closer

        if should_close:
            try:
                closer()
            except Exception:
                pass

    def clear_stream_closer(self) -> None:
        with self._lock:
            self._close_stream = None

    def cancel(self) -> None:
        closer: Callable[[], None] | None

        with self._lock:
            self._event.set()
            closer = self._close_stream
            self._close_stream = None

        if closer is not None:
            try:
                closer()
            except Exception:
                pass


_active_generations: dict[int, GenerationHandle] = {}
_registry_lock = Lock()


def begin_generation(
    conversation_id: int,
) -> GenerationHandle:
    """Register a new generation and cancel an older one."""

    with _registry_lock:
        previous = _active_generations.get(
            conversation_id
        )

        handle = GenerationHandle()
        _active_generations[conversation_id] = handle

    if previous is not None:
        previous.cancel()

    return handle


def cancel_generation(
    conversation_id: int,
) -> bool:
    """Cancel and actively close an Ollama stream when available."""

    with _registry_lock:
        handle = _active_generations.get(
            conversation_id
        )

    if handle is None:
        return False

    handle.cancel()
    return True


def finish_generation(
    conversation_id: int,
    handle: GenerationHandle,
) -> None:
    """Remove only the generation that owns this handle."""

    handle.clear_stream_closer()

    with _registry_lock:
        current = _active_generations.get(
            conversation_id
        )

        if current is handle:
            _active_generations.pop(
                conversation_id,
                None,
            )
