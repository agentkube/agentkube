import { TIPS1, TIPS2, TIPS3, TIPS4, TIPS5, TIPS6, WELCOME } from "@/assets";

export interface Tip {
  id: number;
  title?: string;
  description?: string;
  imageUrl: string;
}

export const tips: Tip[] = [
  {
    id: 1,
    imageUrl: WELCOME,
  },
  {
    id: 2,
    title: "ArgoCD Integration",
    description: "Manage your Argo applications directly from the IDE. Deploy, sync, and monitor your GitOps workflows without leaving Agentkube.",
    imageUrl: TIPS1,
  },
  {
    id: 3,
    title: "Human-in-the-Loop Agent Control",
    description: "Enhanced agentic capabilities with human approval for Agent actions and tool calls. Maintain control over critical cluster operations with human-in-the-loop functionality.",
    imageUrl: TIPS2,
  },
  {
    id: 4,
    title: "Built-in Resource Recommender",
    description: "Get intelligent resource limit suggestions based on historical data points. Optimize your workload configurations with data-driven recommendations.",
    imageUrl: TIPS3,
  },
  {
    id: 5,
    title: "Choose the Right Model",
    description: "Configure various models for specialized Agent tasks. Select the most suitable model for your specific use case and workload requirements.",
    imageUrl: TIPS4,
  },
  {
    id: 6,
    title: "Bring Your Own Keys (BYOK)",
    description: "Use your own LLM models and API keys. Full flexibility to integrate your preferred language models and maintain control over your AI infrastructure.",
    imageUrl: TIPS5,
  },
  {
    id: 7,
    title: "Grype Image Vulnerability Scanning",
    description: "Scan container images for vulnerabilities using Grype. Identify security risks and see which resources are affected directly in your cluster.",
    imageUrl: TIPS6,
  }
];