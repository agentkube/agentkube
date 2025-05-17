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
    title: "Context Switching",
    description: "Navigate your multi-cluster environment effortlessly with Kube Spotlight (cmd + K/ctrl + K). Hit Tab to filter and instantly switch between contexts, eliminating configuration complexity.",
    imageUrl: TIPS1,
  },
  {
    id: 3,
    title: "Focused Search",
    description: "Open kube spotlight (cmd + k / ctrl + k) and use kubernetes shorthands as shortcuts for focused resource searches. For example, \"po\" is shortcut for searching only across pods.",
    imageUrl: TIPS2,
  },
  {
    id: 4,
    title: "Run Commands from Spotlight",
    description: "Execute kubectl commands directly from Spotlight without switching to terminal. Simplify your operations workflow with immediate command access and execution.",
    imageUrl: TIPS3,
  },
  {
    id: 5,
    title: "Resource Canvas",
    description: "Easily visualize your resource path and dependencies. Forget labelSelectors to search for any resource that is dependent.",
    imageUrl: TIPS4,
  },
  {
    id: 6,
    title: "Model Context Protocol Compatible",
    description: "Now you can add MCP Servers to Agentkube app to extend the Agent compatibility.",
    imageUrl: TIPS5,
  },
  {
    id: 7,
    title: "Talk to Cluster",
    description: "Interact with our AI Agent, ask anything about your cluster. Use cmd + L / ctrl + L to open the Talk to Cluster Panel.",
    imageUrl: TIPS6,
  }
];