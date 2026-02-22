"""
Critique and Confidence Agents Module

Uses OpenAI Python SDK with structured output (response_format) for:
1. Critique Agent - Reviews supervisor's draft and provides feedback
2. Confidence Agent - Provides confidence score, impact timing, and affected services
"""

import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from openai import AsyncOpenAI

# Import models from db/models
from orchestrator.db.models.investigate import (
    CritiqueResponse,
    CritiqueIssue,
    ConfidenceResponse,
    AffectedResource,
    TimeAnalysis,
    ConfidenceFactors
)

logger = logging.getLogger(__name__)


# =============================================================================
# Load Prompts
# =============================================================================

def load_critique_prompt() -> str:
    """Load critique agent system prompt."""
    prompt_path = Path(__file__).parent.parent.parent / "workflows" / "prompts" / "critique_system_prompt.txt"
    try:
        return prompt_path.read_text()
    except Exception as e:
        logger.error(f"Failed to load critique prompt: {e}")
        return "You are a critique agent. Review the investigation and provide feedback."


def load_confidence_prompt() -> str:
    """Load confidence agent system prompt."""
    prompt_path = Path(__file__).parent.parent.parent / "workflows" / "prompts" / "confidence_system_prompt.txt"
    try:
        return prompt_path.read_text()
    except Exception as e:
        logger.error(f"Failed to load confidence prompt: {e}")
        return "You are a confidence agent. Provide confidence score and impact analysis."


# =============================================================================
# Critique Agent
# =============================================================================

async def run_critique_agent(
    client: AsyncOpenAI,
    model: str,
    draft_summary: str,
    draft_remediation: str,
    evidence: str = ""
) -> CritiqueResponse:
    """
    Run the Critique Agent to review the supervisor's draft investigation.
    
    Args:
        client: AsyncOpenAI client
        model: Model name to use
        draft_summary: The draft root cause analysis/summary
        draft_remediation: The draft remediation steps
        evidence: Optional collected evidence from sub-agents
    
    Returns:
        CritiqueResponse with structured feedback
    """
    system_prompt = load_critique_prompt()
    
    user_message = f"""Review the following draft investigation:

## Draft Root Cause Analysis
{draft_summary}

## Draft Remediation
{draft_remediation}

{f"## Evidence Collected{chr(10)}{evidence}" if evidence else ""}

Provide your critique in the structured format."""

    try:
        completion = await client.chat.completions.parse(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            response_format=CritiqueResponse,
            temperature=0.1
        )
        
        message = completion.choices[0].message
        
        if message.refusal:
            logger.warning(f"Critique agent refused: {message.refusal}")
            return CritiqueResponse(
                approved=True,
                critique_summary="Unable to critique - proceeding with draft",
                issues=[],
                strengths=[],
                missing_investigations=[],
                remediation_safe=True,
                refinement_guidance=""
            )
        
        return message.parsed
        
    except Exception as e:
        logger.error(f"Critique agent error: {e}")
        # Return a default approved response on error
        return CritiqueResponse(
            approved=True,
            critique_summary=f"Critique unavailable: {str(e)}",
            issues=[],
            strengths=[],
            missing_investigations=[],
            remediation_safe=True,
            refinement_guidance=""
        )


# =============================================================================
# Confidence Agent
# =============================================================================

async def run_confidence_agent(
    client: AsyncOpenAI,
    model: str,
    final_summary: str,
    final_remediation: str,
    evidence: str = ""
) -> ConfidenceResponse:
    """
    Run the Confidence Agent to assess the investigation confidence and impact.
    
    Args:
        client: AsyncOpenAI client
        model: Model name to use
        final_summary: The final root cause analysis
        final_remediation: The final remediation steps
        evidence: Optional collected evidence
    
    Returns:
        ConfidenceResponse with confidence score, timestamps, and affected services
    """
    system_prompt = load_confidence_prompt()
    
    # Get current timestamp for fallback
    now = datetime.now(timezone.utc).isoformat()
    
    user_message = f"""Analyze the following investigation and provide confidence metrics:

## Root Cause Analysis
{final_summary}

## Remediation
{final_remediation}

{f"## Evidence{chr(10)}{evidence}" if evidence else ""}

Current timestamp: {now}

Provide your assessment in the structured format."""

    try:
        completion = await client.chat.completions.parse(
            model=model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_message}
            ],
            response_format=ConfidenceResponse,
            temperature=0.1
        )
        
        message = completion.choices[0].message
        
        if message.refusal:
            logger.warning(f"Confidence agent refused: {message.refusal}")
            return ConfidenceResponse(
                confidence=50,
                matched_pattern=None,
                impacted_since=now,
                last_seen=now,
                services_affected=1,
                affected_resources=[],
                impact_severity="medium"
            )
        
        return message.parsed
        
    except Exception as e:
        logger.error(f"Confidence agent error: {e}")
        # Return default confidence on error
        return ConfidenceResponse(
            confidence=50,
            matched_pattern=None,
            impacted_since=now,
            last_seen=now,
            services_affected=1,
            affected_resources=[],
            impact_severity="medium"
        )


# =============================================================================
# Refinement Helper
# =============================================================================

async def refine_investigation(
    client: AsyncOpenAI,
    model: str,
    draft_summary: str,
    draft_remediation: str,
    critique: CritiqueResponse
) -> tuple[str, str]:
    """
    Refine the investigation based on critique feedback.
    
    Args:
        client: AsyncOpenAI client
        model: Model name
        draft_summary: Original draft summary
        draft_remediation: Original draft remediation
        critique: Critique response with feedback
    
    Returns:
        Tuple of (refined_summary, refined_remediation)
    """
    if critique.approved:
        # No refinement needed
        return draft_summary, draft_remediation
    
    refinement_prompt = f"""You are refining an investigation based on critique feedback.

## Original Summary
{draft_summary}

## Original Remediation
{draft_remediation}

## Critique Feedback
{critique.critique_summary}

### Issues to Address:
{json.dumps([issue.model_dump() for issue in critique.issues], indent=2)}

### Refinement Guidance:
{critique.refinement_guidance}

Please provide a refined analysis that addresses the critique. Keep the same format but improve based on the feedback.
Return the refined summary first, then "---REMEDIATION---", then the refined remediation."""

    try:
        response = await client.chat.completions.create(
            model=model,
            messages=[
                {"role": "system", "content": "You are refining a Kubernetes investigation based on critique feedback. Be concise and actionable."},
                {"role": "user", "content": refinement_prompt}
            ],
            temperature=0.1,
            max_tokens=4000
        )
        
        content = response.choices[0].message.content or ""
        
        if "---REMEDIATION---" in content:
            parts = content.split("---REMEDIATION---")
            return parts[0].strip(), parts[1].strip()
        else:
            # Try to find a natural split
            if "## Remediation" in content:
                parts = content.split("## Remediation")
                return parts[0].strip(), "## Remediation" + parts[1].strip()
            
            # No clear split, return as combined summary
            return content, draft_remediation
            
    except Exception as e:
        logger.error(f"Refinement error: {e}")
        return draft_summary, draft_remediation
