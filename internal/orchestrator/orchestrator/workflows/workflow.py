from agents import Agent, set_default_openai_client, set_tracing_disabled
from openai import AsyncOpenAI
from orchestrator.agents.command_agent import CommandAgent
from orchestrator.agents.diagnosis_agent import DiagnosisAgent
from orchestrator.agents.security_agent import SecurityAgent
from orchestrator.agents.monitoring_agent import MonitoringAgent
from orchestrator.agents.orchestrator_agent import OrchestratorAgent
from config import get_openrouter_api_key, get_openrouter_api_url
import logging

logger = logging.getLogger(__name__)

def agent_workflow(model_name=None, kubecontext=None, custom_prompt=None):
    """Build and return the orchestrator workflow with handoffs
    
    Args:
        model_name: Model to use (defaults to gpt-4o-mini if not specified)
        kubecontext: Optional Kubernetes context to use for commands
        custom_prompt: Optional custom prompt to override defaults
        
    Returns:
        The orchestrator agent with handoffs configured
    """
    model = model_name or "openai/gpt-4o-mini"
    
    set_default_openai_client(
        AsyncOpenAI(
            base_url=get_openrouter_api_url(),
            api_key=get_openrouter_api_key(),
        )
    )
    set_tracing_disabled(True)
    
    # Initialize agent instances
    command_agent_instance = CommandAgent(kubecontext=kubecontext)
    diagnosis_agent_instance = DiagnosisAgent()
    security_agent_instance = SecurityAgent()
    monitoring_agent_instance = MonitoringAgent()
    orchestrator_agent_instance = OrchestratorAgent()
    

    if custom_prompt:
        orchestrator_agent_instance.system_prompt = custom_prompt

    command_agent = Agent(
        model=model,
        name=command_agent_instance.name,
        tools=command_agent_instance.get_tools(),
        instructions=command_agent_instance.system_prompt
    )
    
    diagnosis_agent = Agent(
        model=model,
        name=diagnosis_agent_instance.name,
        tools=diagnosis_agent_instance.get_tools(),
        instructions=diagnosis_agent_instance.system_prompt
    )
    
    monitoring_agent = Agent(
        model=model,
        name=monitoring_agent_instance.name,
        tools=monitoring_agent_instance.get_tools(),
        instructions=monitoring_agent_instance.system_prompt
    )
    
    security_agent = Agent(
        model=model,
        tools=security_agent_instance.get_tools(),
        name=security_agent_instance.name,
        instructions=security_agent_instance.system_prompt
    )
    
    orchestrator = Agent(
        model=model,
        name=orchestrator_agent_instance.name,
        instructions=orchestrator_agent_instance.system_prompt,
        handoffs=[command_agent, monitoring_agent, diagnosis_agent, security_agent]
    )
    
    return orchestrator