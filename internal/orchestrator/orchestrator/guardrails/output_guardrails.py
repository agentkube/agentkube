from agents import output_guardrail, GuardrailFunctionOutput, RunContextWrapper, Agent, Runner
from pydantic import BaseModel

class SensitiveDataOutput(BaseModel):
    reasoning: str
    contains_sensitive_data: bool
    sensitive_items_found: list[str]

# output guardrail agent
sensitive_data_agent = Agent(
    name="Sensitive Data Checker",
    instructions="Check if the assistant's response contains sensitive information like passwords, API keys, tokens, secrets, or other confidential data that should not be exposed to users.",
    output_type=SensitiveDataOutput,
)

@output_guardrail
async def sensitive_data_guardrail(
    context: RunContextWrapper, 
    agent: Agent, 
    output: str
) -> GuardrailFunctionOutput:
    """Agent-based check for sensitive data in output"""
    
    result = await Runner.run(sensitive_data_agent, f"Analyze this response for sensitive data: {output}", context=context.context)
    final_output = result.final_output_as(SensitiveDataOutput)
    
    return GuardrailFunctionOutput(
        output_info=final_output,
        tripwire_triggered=final_output.contains_sensitive_data,
    )