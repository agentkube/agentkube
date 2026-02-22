from typing import List, Optional, Any, Callable
from agents import Agent, OpenAIChatCompletionsModel, ModelSettings

def create_base_agent(
    openai_client: Any,
    model_name: str,
    agent_type: str, 
    instructions: str,
    tools: List[Callable] = [],
    kubecontext: Optional[str] = None
) -> Agent:
    """
    Create a generic base agent with custom instructions and tools.
    
    Args:
        openai_client: The OpenAI client instance
        model_name: The name of the model to use
        agent_type: Type of the agent (e.g. "Logging", "Discovery") - used for agent name
        instructions: System prompt/instructions for the agent
        tools: List of tool functions to enable for this agent
        kubecontext: Kubernetes context (unused in base, but kept for interface consistency)
        
    Returns:
        Agent: Configured agent instance
    """
    
    agent = Agent(
        name=f"Agentkube: {agent_type} Agent",
        instructions=instructions,
        model=OpenAIChatCompletionsModel(
            model=model_name,
            openai_client=openai_client
        ),
        model_settings=ModelSettings(
            parallel_tool_calls=False,
            temperature=0.1,
            extra_headers={
                "HTTP-Referer": "https://agentkube.com",
                "X-Title": "Agentkube"
            }
        ),
        tools=tools
    )
    
    return agent