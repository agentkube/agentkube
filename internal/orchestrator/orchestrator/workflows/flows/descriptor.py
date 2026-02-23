from agents import Agent, OpenAIChatCompletionsModel, ModelSettings

DESCRIPTOR_SYSTEM_INSTRUCTION: str = """You are a Kubernetes Investigation Metadata Generator.

Your task is to analyze investigation requests and generate structured metadata in JSON format.

<output_format>
{
    "title": "Concise, descriptive title for the investigation",
    "tags": ["tag1", "tag2", "tag3"]
}
</output_format>

<responsibilities>
- Generate investigation task title based issue/prompt provided by user
- Analyze what might be the issue based on prompt provided
</responsibilities>

GUIDELINES:
- Extract meaningful information from the user's request
- Create a clear, actionable title
- Identify the primary subject of investigation
- Generate relevant tags based on the issue type, resource types, and symptoms
- Focus on Kubernetes-specific terminology and concepts

EXAMPLE TAGS:
- Resource types: "pod", "service", "deployment", "node", "pvc"
- Issue types: "crash-loop", "image-pull", "networking", "performance", "resource-limits"
- Severities: "critical", "warning", "info"
- Components: "scheduler", "kubelet", "kube-proxy", "dns"

Always return valid JSON format only."""

def create_descriptor_agent(openai_client, model_name: str) -> Agent:
    """Create the descriptor agent for generating investigation metadata."""
    
    descriptor_agent = Agent(
        name="Agentkube: Descriptor Agent",
        instructions=DESCRIPTOR_SYSTEM_INSTRUCTION,
        model=OpenAIChatCompletionsModel(
            model=model_name,
            openai_client=openai_client
        ),
        model_settings=ModelSettings(
            temperature=0.1,
            extra_headers={
                "HTTP-Referer": "https://agentkube.com",  
                "X-Title": "Agentkube"
            }
        ),
        tools=[]
    )
    
    return descriptor_agent