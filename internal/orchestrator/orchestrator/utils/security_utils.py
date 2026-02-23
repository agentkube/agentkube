import json
from typing import Dict, AsyncGenerator, Optional
from agents import Agent, Runner
from openai import AsyncOpenAI
from agents import Agent, Runner, set_default_openai_client, set_default_openai_api, set_tracing_disabled, OpenAIChatCompletionsModel

from orchestrator.core.prompt.security_prompt import SECURITY_REMEDIATION_PROMPT

from config.config import get_openrouter_api_key, get_openrouter_api_url
from orchestrator.services.byok.provider import get_provider_for_model

async def stream_security_remediation(
    manifest_content: str,
    vulnerability_context: Optional[Dict[str, str]] = None,
    model_name: str = "openai/gpt-4o-mini"
) -> AsyncGenerator[str, None]:
    """
    Stream a security remediation response for a Kubernetes manifest.

    Args:
        manifest_content: The Kubernetes manifest content to analyze
        vulnerability_context: Optional context about the vulnerability
        model_name: The model to use for remediation

    Yields:
        SSE formatted string chunks for streaming
    """
    custom_client = AsyncOpenAI(base_url=get_openrouter_api_url(), api_key=get_openrouter_api_key())
    set_default_openai_client(custom_client)
    set_tracing_disabled(True)
    set_default_openai_api("chat_completions")
    formatted_message = format_security_message(manifest_content, vulnerability_context)

    # Get provider configuration directly
    provider_config = get_provider_for_model(model_name)

    agent = Agent(
        name="Kubernetes Security Remediation",
        instructions=SECURITY_REMEDIATION_PROMPT,
        model=OpenAIChatCompletionsModel(
            model=provider_config.model_name,
            openai_client=AsyncOpenAI(
                base_url=provider_config.base_url,
                api_key=provider_config.api_key
            )
        ),
    )
    
    # Run the agent with streaming enabled
    result = Runner.run_streamed(agent, input=formatted_message)
    
    # Stream the results
    async for event in result.stream_events():
        try:
            # Process raw text deltas for streaming
            if event.type == "raw_response_event":
                if hasattr(event.data, "delta") and event.data.delta:
                    yield f"data: {json.dumps({'text': event.data.delta})}"
                    
            # Process run items (higher-level events)
            elif event.type == "run_item_stream_event":
                if event.item.type == "message_output_item":
                    if hasattr(event.item, "content") and event.item.content:
                        yield f"data: {json.dumps({'text': event.item.content})}"
                
        except Exception as e:
            error_msg = f"Error processing event: {str(e)}"
            print(f"ERROR: {error_msg}")
            yield f"data: {json.dumps({'error': error_msg})}"

    # Signal that the streaming is complete
    yield f"data: {json.dumps({'done': True})}"

def format_security_message(manifest_content: str, vulnerability_context: Optional[dict] = None) -> str:
    """Format the security message with manifest and vulnerability context."""
    message_parts = ["Please analyze this Kubernetes manifest for security issues:"]
    
    # Add manifest content
    message_parts.append("```yaml")
    message_parts.append(manifest_content)
    message_parts.append("```")
    
    # Add vulnerability context if provided
    if vulnerability_context:
        message_parts.append("\nVulnerability Context:")
        
        # Check if severity exists in the dictionary (not using .get() on a Pydantic model)
        if isinstance(vulnerability_context, dict):
            # If it's a regular dictionary
            if "severity" in vulnerability_context:
                message_parts.append(f"Severity: {vulnerability_context['severity']}")
            if "description" in vulnerability_context:
                message_parts.append(f"Description: {vulnerability_context['description']}")
            if "code_snippet" in vulnerability_context:
                message_parts.append(f"Vulnerable Code:\n```yaml\n{vulnerability_context['code_snippet']}\n```")
        else:
            # If it's a Pydantic model
            if hasattr(vulnerability_context, "severity") and vulnerability_context.severity:
                message_parts.append(f"Severity: {vulnerability_context.severity}")
            if hasattr(vulnerability_context, "description") and vulnerability_context.description:
                message_parts.append(f"Description: {vulnerability_context.description}")
            if hasattr(vulnerability_context, "code_snippet") and vulnerability_context.code_snippet:
                message_parts.append(f"Vulnerable Code:\n```yaml\n{vulnerability_context.code_snippet}\n```")
    
    return "\n".join(message_parts)