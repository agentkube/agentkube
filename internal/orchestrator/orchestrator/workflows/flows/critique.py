import os
import platform
from datetime import datetime
from agents import Agent, OpenAIChatCompletionsModel, ModelSettings

def load_prompt():
    prompt_path = os.path.join(os.path.dirname(__file__), "../prompts/critique_system_prompt.txt")
    with open(prompt_path, "r") as f:
        return f.read()

def create_critique_agent(openai_client, model_name: str, task_id: str = None) -> Agent:
    """Create the critique agent."""
    
    prompt = load_prompt()

    env_info = f"""
<env>
OS Version: {platform.system().lower()} {platform.release()}
Shell: {os.environ.get('SHELL', 'Unknown').split('/')[-1] if os.environ.get('SHELL') else 'Unknown'}
Working directory: {os.getcwd()}
Is directory a git repo: {'Yes' if os.path.exists(os.path.join(os.getcwd(), '.git')) else 'No'}
Today's date: {datetime.now().strftime('%Y-%m-%d')}
</env>
"""
    
    critique_agent = Agent(
        name="Agentkube: Critique Agent",
        instructions=prompt + env_info,
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
        tools=[] 
    )
    
    return critique_agent
