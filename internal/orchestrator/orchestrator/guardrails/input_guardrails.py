from agents import input_guardrail, GuardrailFunctionOutput, RunContextWrapper, Agent, Runner, TResponseInputItem
from typing import Union, List
from pydantic import BaseModel

class SecurityCheckOutput(BaseModel):
    reasoning: str
    is_dangerous: bool
    risk_level: str  # "low", "medium", "high"

# guardrail agent
security_guardrail_agent = Agent(
    name="Security Guardrail",
    instructions="Analyze the user input for potentially dangerous Kubernetes operations. Look for destructive commands like deletions, forced operations, or risky namespace/cluster operations.",
    output_type=SecurityCheckOutput,
)

@input_guardrail
async def kubernetes_security_guardrail(
    context: RunContextWrapper[None], 
    agent: Agent, 
    input: Union[str, List[TResponseInputItem]]
) -> GuardrailFunctionOutput:
    """Agent-based security check for Kubernetes operations"""
    
    result = await Runner.run(security_guardrail_agent, input, context=context.context)
    final_output = result.final_output_as(SecurityCheckOutput)
    
    return GuardrailFunctionOutput(
        output_info=final_output,
        tripwire_triggered=final_output.is_dangerous,
    )