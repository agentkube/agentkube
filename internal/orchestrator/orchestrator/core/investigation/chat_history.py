# orchestrator/core/investigation/chat_history.py

from typing import List, Dict, Any
from datetime import datetime


class ChatHistoryManager:
    """
    Manages conversation history for investigations.
    Maintains a single history array that gets passed to all sub-agents.
    """

    def __init__(self):
        """Initialize empty chat history for this investigation."""
        self.history: List[Dict[str, Any]] = []

    def add_user_message(self, content: str) -> None:
        """Add a user message to history."""
        self.history.append({
            "role": "user",
            "content": content
        })

    def add_assistant_message(self, content: str) -> None:
        """Add an assistant message to history."""
        self.history.append({
            "role": "assistant",
            "content": content
        })

    def add_tool_call(self, tool_name: str, arguments: str, call_id: str) -> None:
        """Add a tool call to history."""
        self.history.append({
            "type": "function_call",
            "name": tool_name,
            "arguments": arguments,
            "call_id": call_id
        })

    def add_tool_output(self, call_id: str, output: str) -> None:
        """Add a tool output to history."""
        self.history.append({
            "type": "function_call_output",
            "call_id": call_id,
            "output": output
        })

    def get_history_with_new_message(self, message: str) -> List[Dict[str, Any]]:
        """
        Get the full history with a new user message appended.
        This is what gets passed to sub-agents.
        """
        return self.history + [{"role": "user", "content": message}]

    def get_full_history(self) -> List[Dict[str, Any]]:
        """Get the complete history."""
        return self.history.copy()

    def clear(self) -> None:
        """Clear all history."""
        self.history = []

    def __len__(self) -> int:
        """Return the number of items in history."""
        return len(self.history)

    def __repr__(self) -> str:
        """String representation for debugging."""
        return f"ChatHistoryManager(items={len(self.history)})"
