"""
Tool to GenUI Component Mapper

This module defines mappings between tool names and their corresponding
GenUI (Generative UI) components on the frontend.

When a tool is executed and its name exists in the mapping, the backend
will emit a custom_component event that the frontend can render as a
rich UI component instead of just plain text.
"""

from typing import Dict, Optional, Any


# Tool to Component Mapping
# Key: tool_name (string) - The name of the tool function
# Value: component_name (string) - The corresponding component name in ComponentMap on frontend
TOOL_TO_COMPONENT_MAP: Dict[str, str] = {
    # Kubectl resource listing tools -> ResourceList component
    "list_resources": "list_resources",
    "list_pods": "list_resources",
    "list_pods_not_running": "list_resources",

    # Image vulnerability scanning -> ImageVulnerabilitySummary component
    "scan_image": "image_vulnerability_summary",

    # ArgoCD application listing -> ArgoApplicationList component
    "list_all_applications": "argocd_applications_list",
    "list_applications": "argocd_applications_list",

    # ArgoCD single application detail -> ArgoApplicationDetail component
    "get_application": "argocd_application_detail",

    # Drift Analysis -> DriftAnalysis component
    "analyze_drift": "drift_analysis",

    # Add more mappings here as you create more GenUI components
    # Example:
    # "describe_resource": "resource_detail",
    # "get_pod_logs": "pod_logs_viewer",
    # "get_events": "events_timeline",
}


def get_component_for_tool(tool_name: str) -> Optional[str]:
    """
    Get the GenUI component name for a given tool.

    Args:
        tool_name: The name of the tool that was executed

    Returns:
        The component name to use on the frontend, or None if no mapping exists
    """
    return TOOL_TO_COMPONENT_MAP.get(tool_name)


def should_emit_custom_component(tool_name: str, result: Dict[str, Any]) -> bool:
    """
    Check if a custom_component event should be emitted for this tool.

    Args:
        tool_name: The name of the tool that was executed
        result: The result dict from the tool execution

    Returns:
        True if a custom_component event should be emitted, False otherwise
    """
    # Only emit if:
    # 1. Tool has a component mapping
    # 2. Tool execution was successful
    return get_component_for_tool(tool_name) is not None and result.get("success", False)


def prepare_component_props(tool_name: str, result_output: Any) -> Dict[str, Any]:
    """
    Prepare component props from tool result output.

    This function handles parsing and transforming the raw tool output
    into props suitable for the GenUI component.

    You can add additional metadata/props here based on the tool type to control
    frontend rendering. For example:

        if tool_name == "query_prometheus":
            parsed_output["chartType"] = "histogram"  # Chart type to render
            parsed_output["showLegend"] = True        # Show/hide legend
            parsed_output["color"] = "purple"         # Chart color theme

    The frontend component will receive all these props:

        const PrometheusChartComponent = (props: {
          data: any;
          chartType?: string;    // Custom prop from backend
          showLegend?: boolean;  // Custom prop from backend
          color?: string;        // Custom prop from backend
        }) => {
          // Render different chart based on chartType
          return props.chartType === "histogram" ? <Histogram /> : <LineChart />
        };

    Args:
        tool_name: The name of the tool that was executed
        result_output: The output from the tool execution

    Returns:
        Dict of props to pass to the GenUI component
    """
    import json
    import ast

    # Try to parse string output as JSON
    if isinstance(result_output, str):
        try:
            # First try to parse as Python literal (handles Python dict strings properly)
            parsed = ast.literal_eval(result_output)
            # Convert to JSON-serializable format (handles None, True, False)
            return json.loads(json.dumps(parsed))
        except (json.JSONDecodeError, ValueError, SyntaxError):
            # If parsing fails, wrap in output key
            return {"output": result_output}

    # If already a dict/object, return as-is
    if isinstance(result_output, dict):
        return result_output

    # For any other type, wrap it
    return {"output": str(result_output)}
