# orchestrator/workflows/flows/parser.py

import os
import platform
from datetime import datetime
from pydantic import BaseModel
from typing import List
from agents import Agent, OpenAIChatCompletionsModel, ModelSettings


class ParsedTOONOutput(BaseModel):
    """Schema for parser agent output - matches SubTaskModel without plan field."""
    subject: str
    status: int = 0  # number of issues found
    reason: str  # title/brief reason
    goal: str
    discovery: str


PARSER_AGENT_PROMPT = f"""<identity>
You are a specialized TOON (Token-Oriented Object Notation) parser agent.
Built-in AI Agent in Agentkube, an AI-Powered Kubernetes Management IDE
</identity>

<role>
TOON Data Parser - Convert TOON format data into structured output
</role>

<purpose>
Your ONLY purpose is to parse TOON-formatted data from other agents and convert it into the required structured output schema.
You have NO tools - you only parse and structure data.
</purpose>

<toon_format_reference>
TOON (Token-Oriented Object Notation) is a token-efficient format that reduces tokens by 30-50%:

Example TOON input:
```
subject: Pod CrashLoopBackOff Investigation
status: 3
reason: Container startup failures detected
goal: Investigate pod startup failures in production namespace from last 15 minutes to identify root cause
discovery:
  Container `api-server` failing health checks
  Image pull errors for `registry.io/app:v1.2.3`
  Memory limit exceeded during initialization
```

Key TOON syntax rules:
- No quotes around string values
- No braces or colons for objects
</toon_format_reference>

<parsing_rules>
1. Extract field values from TOON key-value pairs
2. Convert status to integer (number of issues found)
3. Preserve markdown formatting in discovery field
4. Handle nested lists and multi-line values
5. Use backticks (`) for resource names in discovery, not quotes
</parsing_rules>

<workflow>
1. Receive TOON-formatted input from a specialist agent
2. Parse each field from the TOON format
3. Validate and convert data types (status must be integer)
4. Format discovery content with proper markdown
5. Return structured output

IMPORTANT: Parse the TOON data accurately and return the structured output.
</workflow>

<env>
OS Version: {platform.system().lower()} {platform.release()}
Working directory: {os.getcwd()}
Today's date: {datetime.now().strftime('%Y-%m-%d')}
</env>
"""


def create_parser_agent(openai_client, model_name: str) -> Agent:
    """
    Create the parser agent.

    This agent has NO tools - its only purpose is to parse TOON-formatted
    data into structured ParsedTOONOutput.

    The output_type parameter enforces that the agent returns a validated
    Pydantic model matching ParsedTOONOutput schema.
    """

    parser_agent = Agent(
        name="Agentkube: Parser Agent",
        instructions=PARSER_AGENT_PROMPT,
        model=OpenAIChatCompletionsModel(
            model=model_name,
            openai_client=openai_client
        ),
        model_settings=ModelSettings(
            # parallel_tool_calls=False,
            # temperature=0.0,  # Zero temperature for consistent parsing
            extra_headers={
                "HTTP-Referer": "https://agentkube.com",
                "X-Title": "Agentkube"
            }
        ),
        tools=[],  # NO TOOLS - parser only
        output_type=ParsedTOONOutput  # Enforce structured output with Pydantic
    )

    return parser_agent


def toon_to_prompt(toon_data: str) -> str:
    """
    Create a parsing prompt for the parser agent.

    Args:
        toon_data: TOON-formatted string from a specialist agent

    Returns:
        Prompt string for the parser agent
    """
    return f"""Parse the following TOON-formatted data and convert it to structured output:

<toon_input>
{toon_data}
</toon_input>

Extract: subject, status (integer), reason, goal, discovery"""
