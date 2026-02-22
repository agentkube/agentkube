# orchestrator/core/investigation/loop_manager.py
from typing import List, Dict, Any
from datetime import datetime
import json

class ToolCallTracker:
    """Tracks tool calls to prevent duplicates and manage investigation state."""
    
    def __init__(self):
        self.tool_calls: List[Dict[str, Any]] = []
        self.call_signatures: set = set()
        
    def add_call(self, tool_name: str, arguments: Dict[str, Any], output: str) -> None:
        """Add a tool call to the tracker."""
        call_data = {
            "tool": tool_name,
            "arguments": arguments,
            "output": output,
            "timestamp": datetime.now().isoformat()
        }
        self.tool_calls.append(call_data)
        
        print("Add tool calls", self.tool_calls)
        # Create signature for duplicate detection
        signature = f"{tool_name}:{json.dumps(arguments, sort_keys=True)}"
        self.call_signatures.add(signature)
    
    def is_duplicate(self, tool_name: str, arguments: Dict[str, Any]) -> bool:
        """Check if this tool call would be a duplicate."""
        signature = f"{tool_name}:{json.dumps(arguments, sort_keys=True)}"
        return signature in self.call_signatures
    
    def get_call_history(self) -> List[Dict[str, Any]]:
        """Get all tracked tool calls."""
        return self.tool_calls.copy()

class AgenticLoopManager:
    """Manages the agentic investigation loop with safeguards and context management."""
    
    def __init__(self, max_steps: int = 10):
        self.max_steps = max_steps
        self.current_step = 0
        self.tracker = ToolCallTracker()
        self.investigation_context = {}
        
    def can_continue(self) -> bool:
        """Check if the loop can continue based on step limit."""
        return self.current_step < self.max_steps
    
    def increment_step(self) -> None:
        """Increment the current step counter."""
        self.current_step += 1
    
    def get_investigation_summary(self) -> Dict[str, Any]:
        """Get a summary of the investigation progress."""
        return {
            "steps_taken": self.current_step,
            "max_steps": self.max_steps,
            "total_tool_calls": len(self.tracker.tool_calls),
            "tools_used": list(set(call["tool"] for call in self.tracker.tool_calls))
        }