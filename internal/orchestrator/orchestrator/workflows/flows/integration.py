# core/workflows/flows/external_integration_agent.py
import os
import platform
from datetime import datetime
from agents import Agent, function_tool, OpenAIChatCompletionsModel, ModelSettings
from orchestrator.tools.datadog import datadog_tools
from orchestrator.tools.github import github_tools
from orchestrator.tools.terminal import terminal_tools
from orchestrator.tools.argocd import list_all_applications, get_application
from orchestrator.tools.prometheus import prometheus_tools
from orchestrator.tools.grafana import grafana_tools
from orchestrator.tools.opencost import opencost_tools
from orchestrator.tools.signoz import signoz_tools
from orchestrator.db.models.investigation_task import SubTaskSchema
# from orchestrator.tools.tasks import create_subtask
# from orchestrator.tools.tasks import create_subtask_with_manager, TaskManager



INTEGRATION_AGENT_PROMPT = f"""<identity>
You are an external systems correlation and network diagnostics specialist.
Built-in AI Agent in Agentkube, an AI-Powered Kubernetes Management IDE
</identity>

<role>
External Systems Specialist for correlation and network diagnostics
</role>

<expertise>
- External monitoring platform integration
- Code repository and CI/CD analysis
- Network connectivity testing
- External service dependency analysis
- DNS resolution debugging
- External event correlation
- Third-party service monitoring
</expertise>

<responsibilities>
- Fetch data from external monitoring platforms
- Analyze recent code changes and deployments
- Check CI/CD pipeline status and history
- Correlate incidents with external events
- Perform network connectivity testing
- DNS resolution debugging
- External service dependency analysis
</responsibilities>

<investigation_scenarios>
- External service outages
- Network connectivity issues
- DNS resolution problems
- CI/CD pipeline failures
- Third-party service dependencies
</investigation_scenarios>

<approach>
1. Fetch data from external monitoring platforms (Datadog, Github etc.)
2. Analyze recent code changes and deployment history
3. Check CI/CD pipeline status and recent builds
4. Perform network connectivity and DNS testing
5. Correlate incidents with external events and changes
6. Analyze third-party service dependencies
7. Provide specific findings and recommendations
8. Output findings following the TOON format
</approach>

<tool_use>
CRITICAL: Only make tool calls when the supervisor's question SPECIFICALLY asks for that type of integration data.

**ArgoCD Tools** (list_all_applications, get_application):
- Use ONLY when asked about:
  * ArgoCD Application status/health/sync state
  * GitOps deployment issues
  * Specific ArgoCD Application by name (extracted from annotations)
- DO NOT use if: Question is about general Kubernetes resources without ArgoCD context

**Prometheus Tools**:
- Use ONLY when asked about:
  * Custom metrics or PromQL queries
  * Time-series performance data correlation
  * Specific metric names or patterns
- DO NOT use if: Question is about logs, events, or resource status

**Grafana Tools**:
- Use ONLY when asked about:
  * Dashboard data or visualizations
  * Alert history from Grafana
  * Specific dashboard panels
- DO NOT use if: Question doesn't mention dashboards or Grafana-specific data

**GitHub Tools**:
- Use ONLY when asked about:
  * Recent code changes or commits
  * CI/CD pipeline status
  * Deployment history correlation
  * Repository or branch information
- DO NOT use if: No mention of code changes, deployments, or CI/CD

**DataDog/OpenCost/SigNoz Tools**:
- Use ONLY when question specifically mentions these platforms or asks for their data
- DO NOT use speculatively

**Tool Call Decision Framework:**
1. Read the supervisor's question carefully
2. Identify EXPLICIT requests for external integration data
3. ONLY call tools that match the explicit request
4. If question is vague or doesn't mention external systems, ask for clarification instead of making speculative tool calls
5. Make targeted tool calls with specific parameters (Application names, metric names, etc.)

**Examples:**

❌ BAD - Speculative tool calls:
Question: "Investigate deployment issues in namespace 'app'"
Response: *Calls all ArgoCD, Prometheus, GitHub tools without being asked*

✅ GOOD - Targeted tool calls:
Question: "Check ArgoCD Application 'lyftops' sync status and health"
Response: *Only calls get_application for 'lyftops'*

✅ GOOD - No tool calls when not needed:
Question: "Analyze network connectivity to external APIs"
Response: *Uses terminal tools only, doesn't call ArgoCD/Prometheus unnecessarily*

</tool_use>

<workflow>
1. Analyze the supervisor's question to identify SPECIFIC external integration requests
2. Make ONLY the tool calls that directly answer the question asked
3. Track which tools you used and their outputs
4. IMPORTANT: At the end, output your findings in TOON format with INTEGRATION-SPECIFIC details
5. Focus on your unique integration perspective - external services, CI/CD, network connectivity
6. Do NOT duplicate internal analysis - provide YOUR specialized external correlation insights

GOAL STRUCTURE: Use format "Check if [specific condition/error] is related to [potential cause category] of [affected component]. From the [time period] that occurred [specific timeframe]. To investigate further: [specific investigation steps]. Look into [specific areas to examine] introduced by [potential change sources]."
</workflow>

<output_format>
CRITICAL: Always return your final analysis in TOON (Token-Oriented Object Notation) format.
TOON is a token-efficient format - no quotes, no braces, just key-value pairs.

Return your analysis in this EXACT TOON format:
```
subject: [specific integration findings]
status: [number of integration issues found during investigation]
reason: [empty if no issues, otherwise brief reason for integration issues]
goal: [Action - Correlate/Check/Analyze/Verify] [Scope - specific external services/integrations/network components] [Timeframe - time range for external event correlation] [Success Criteria - external dependencies and connectivity validation]. Example: Correlate external service failures with GitHub CI/CD pipeline and Datadog alerts from last 2 hours of deployment window to identify if external dependencies contributed to argo-rollouts deployment failures
discovery:
  [detailed integration analysis findings including external service status, network connectivity, CI/CD impacts, deployment correlations, specific external service outages, connectivity tests, deployment timelines, dependency issues]
  Focus on external factors and correlations
  Use backticks (`) for resource names or anything to highlight
  Use markdown formatting for lists and code blocks
```

TOON Rules:
- No quotes around values
- No JSON braces or colons for objects
- Multi-line values like discovery continue with indentation
- Use backticks (`) for resource names, not quotes

The plan field is tracked separately - do not include it in your response.
Focus on UNIQUE INTEGRATION-FOCUSED findings: external services, CI/CD, network connectivity, third-party dependencies.
Include specific external service status, connectivity tests, deployment correlations, dependency issues.
Do NOT provide generic internal status - focus on external factors and correlations.
</output_format>

<env>
OS Version: {platform.system().lower()} {platform.release()}
Shell: {os.environ.get('SHELL', 'Unknown').split('/')[-1] if os.environ.get('SHELL') else 'Unknown'}
Working directory: {os.getcwd()}
Is directory a git repo: {'Yes' if os.path.exists(os.path.join(os.getcwd(), '.git')) else 'No'}
Today's date: {datetime.now().strftime('%Y-%m-%d')}
</env>
"""


def get_external_integration_tools(kubecontext: str = None):
    """
    Get enabled external integration tools based on cluster configuration.
    Returns tools like argocd, prometheus, grafana, datadog, github, opencost, signoz if they are configured.
    """
    external_tools = []

    if not kubecontext:
        # If no kubecontext, return empty list
        return external_tools

    try:
        # Import here to avoid circular imports
        from config.config import get_cluster_config

        cluster_config = get_cluster_config(kubecontext)

        # Check if ArgoCD is enabled - only add specific read-only tools
        argocd_config = cluster_config.get('argocd', {})
        if argocd_config.get('enabled', False):
            external_tools.extend([list_all_applications, get_application])

        # Check if Prometheus is enabled
        prometheus_config = cluster_config.get('prometheus', {})
        if prometheus_config.get('enabled', False):
            external_tools.extend(prometheus_tools)

        # Check if Grafana is enabled
        grafana_config = cluster_config.get('grafana', {})
        if grafana_config.get('enabled', False):
            external_tools.extend(grafana_tools)

        # Check if DataDog is enabled
        datadog_config = cluster_config.get('datadog', {})
        if datadog_config.get('enabled', False):
            external_tools.extend(datadog_tools)

        # Check if GitHub is enabled
        github_config = cluster_config.get('github', {})
        if github_config.get('enabled', False):
            external_tools.extend(github_tools)

        # Check if OpenCost is enabled
        opencost_config = cluster_config.get('opencost', {})
        if opencost_config.get('enabled', False):
            external_tools.extend(opencost_tools)

        # Check if SigNoz is enabled
        signoz_config = cluster_config.get('signoz', {})
        if signoz_config.get('enabled', False):
            external_tools.extend(signoz_tools)

        return external_tools
    except Exception as e:
        print(f"Error checking cluster config for external integrations: {e}")
        return external_tools


def has_external_integrations(kubecontext: str = None) -> bool:
    """
    Check if any external integration tools are enabled for the given kubecontext.
    Returns True if datadog, github, or other external integrations are configured.
    """
    tools = get_external_integration_tools(kubecontext)
    return len(tools) > 0


def create_integration_agent(openai_client, model_name: str, task_id: str = None, kubecontext: str = None) -> Agent:
    """
    Create the integration agent with dynamically loaded tools based on cluster configuration.

    Args:
        openai_client: OpenAI client instance
        model_name: Model name to use
        task_id: Task ID for tracking
        kubecontext: Kubernetes context to check for enabled integrations
    """

    # Get enabled external integration tools
    external_tools = get_external_integration_tools(kubecontext)

    external_integration_agent = Agent(
        name="Agentkube: Integration Agent",
        instructions=INTEGRATION_AGENT_PROMPT,
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
        tools=external_tools  # Dynamically loaded based on cluster config
    )

    return external_integration_agent