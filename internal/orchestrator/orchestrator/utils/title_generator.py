"""
Title Generator Module

Generates descriptive session titles for investigation reports based on
root cause analysis and user prompt using the OpenAI Agents SDK.

Follows the same pattern as log_analyzer.py and event_analyzer.py:
- Uses Agent with Runner.run_streamed()
- Uses process_stream_events() for streaming

Yields same JSON format as other analyzers:
- {"text": "token"} for text chunks
- {"done": True} for completion
"""

import json
from datetime import datetime
from typing import AsyncGenerator, Optional
from openai import AsyncOpenAI
from pydantic import BaseModel

from agents import Agent, Runner, OpenAIChatCompletionsModel, ModelSettings
from agents import trace, gen_trace_id

from orchestrator.db.models.stream import MessageStreamStatus
from orchestrator.services.byok.provider import get_provider_for_model
from orchestrator.utils.stream_utils import process_stream_events, setup_openai_client


class TitleGenerationRequest(BaseModel):
    """Request model for title generation."""
    task_id: str
    user_prompt: str
    root_cause: str
    model: Optional[str] = "openai/gpt-4o-mini"


TITLE_GENERATION_SYSTEM_PROMPT = """<identity>
You are an expert at creating concise, descriptive titles for Kubernetes investigation reports.
</identity>

<role>
Title Generator for Kubernetes Investigation Reports
</role>

<task>
Generate a short, scannable title (max 60 characters) that accurately captures the essence of the investigation based on the root cause analysis provided.
</task>

<guidelines>
- Keep it short and actionable (max 60 characters)
- Focus on the core issue identified in the root cause
- Use proper Kubernetes terminology
- Make it scannable and memorable
- Do NOT include quotes, emojis, or special characters
- Be specific about the resource and issue type
</guidelines>

<examples>
Good titles:
- Pod CrashLoopBackOff in payment-service
- Memory OOM in api-gateway deployment  
- ImagePullBackOff for registry.io/app:v2
- DNS resolution failure in prod namespace
- PVC pending - StorageClass not found
- NetworkPolicy blocking egress traffic
- CoreDNS memory pressure causing timeouts
</examples>

<output_format>
Respond with ONLY the title text. No quotes, no explanation, just the title.
</output_format>"""


def create_title_generation_prompt(user_prompt: str, root_cause: str) -> str:
    """Create the prompt for title generation."""
    return f"""Generate a title for this Kubernetes investigation:

**User's Original Request:**
{user_prompt}

**Root Cause Analysis:**
{root_cause}

Generate a concise title (max 60 characters):"""


async def stream_title_generation(
    request: TitleGenerationRequest
) -> AsyncGenerator[str, None]:
    """
    Stream title generation using Agents SDK with process_stream_events.
    
    Follows the same pattern as log_analyzer.py and event_analyzer.py:
    - Creates an Agent with title generation instructions
    - Runs with Runner.run_streamed()
    - Yields events via process_stream_events()
    
    Args:
        request: TitleGenerationRequest containing task_id, user_prompt, root_cause
        
    Yields:
        str: Streaming JSON events (same format as other analyzers)
    """
    setup_openai_client()
    
    trace_id = gen_trace_id()
    
    with trace(workflow_name="Title Generation", trace_id=trace_id):
        try:
            # Get provider configuration directly
            provider_config = get_provider_for_model(request.model)
            
            # Create title generator agent (same pattern as log_analyzer_agent)
            title_generator_agent = Agent(
                name="Agentkube: Title Generator Agent",
                instructions=TITLE_GENERATION_SYSTEM_PROMPT,
                model_settings=ModelSettings(
                    temperature=0.3,
                    extra_headers={
                        "HTTP-Referer": "https://agentkube.com",
                        "X-Title": "Agentkube"
                    }
                ),
                model=OpenAIChatCompletionsModel(
                    model=provider_config.model_name,
                    openai_client=AsyncOpenAI(
                        base_url=provider_config.base_url,
                        api_key=provider_config.api_key,
                    )
                ),
            )
            
            # Create prompt
            prompt = create_title_generation_prompt(request.user_prompt, request.root_cause)
            
            # Run agent with streaming (same as log_analyzer)
            result = Runner.run_streamed(title_generator_agent, input=prompt, max_turns=20)
            
            # Process and yield events (same format as other analyzers)
            accumulated_title = ""
            async for event_data in process_stream_events(result, trace_id):
                # Parse the event to accumulate title
                try:
                    event = json.loads(event_data)
                    if 'text' in event:
                        accumulated_title += event['text']
                except:
                    pass
                yield event_data
            
            # After streaming completes, update the task title in DB
            final_title = accumulated_title.strip().strip('"').strip("'")[:60]
            if final_title:
                try:
                    from orchestrator.core.investigation.event_persistence import update_task_status
                    from orchestrator.db.models.task import TaskStatus
                    update_task_status(request.task_id, TaskStatus.COMPLETED.value, title=final_title)
                except Exception as e:
                    print(f"Warning: Failed to update task title in DB: {e}")
            
            # Yield title complete event for frontend
            yield json.dumps({
                'title_complete': final_title,
                'task_id': request.task_id
            })
            
        except Exception as e:
            error_msg = f"Error in title generation: {str(e)}"
            print(f"ERROR: {error_msg}")
            yield json.dumps({'error': error_msg})
            yield json.dumps({'done': True})
            yield MessageStreamStatus.done.value


async def generate_title_sync(
    task_id: str,
    user_prompt: str,
    root_cause: str,
    model: str = "openai/gpt-4o-mini"
) -> str:
    """
    Generate title synchronously (non-streaming).
    
    Useful for internal calls where streaming is not needed.
    
    Returns:
        str: Generated title
    """
    try:
        # Get provider configuration directly
        provider_config = get_provider_for_model(model)
        
        openai_client = AsyncOpenAI(
            base_url=provider_config.base_url,
            api_key=provider_config.api_key
        )
        
        # Create prompt
        prompt = create_title_generation_prompt(user_prompt, root_cause)
        
        # Non-streaming completion
        response = await openai_client.chat.completions.create(
            model=provider_config.model_name,
            messages=[
                {"role": "system", "content": TITLE_GENERATION_SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            temperature=0.3,
            max_tokens=80,
            extra_headers={
                "HTTP-Referer": "https://agentkube.com",
                "X-Title": "Agentkube"
            }
        )
        
        if response.choices and response.choices[0].message.content:
            return response.choices[0].message.content.strip().strip('"').strip("'")[:60]
        
        return "Kubernetes Investigation Report"
        
    except Exception as e:
        print(f"Title generation error: {e}")
        return "Kubernetes Investigation Report"
