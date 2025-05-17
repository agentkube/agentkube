export interface Tip {
  id: number;
  title?: string;
  description?: string;
  imageUrl: string;
}

export const tips: Tip[] = [
  {
    id: 1,
    // title: "Automatic Updates",
    // description: "Agentkube checks for updates in the background using Tauri's secure update system. When a new version is available, you'll be notified and can install it with a single click.",
    imageUrl: "/api/placeholder/400/300",
  },
  {
    id: 2,
    title: "Secure Update Verification",
    description: "Every update is cryptographically signed and verified before installation to ensure it comes from a trusted source. This prevents malicious updates and ensures your application's integrity.",
    imageUrl: "/api/placeholder/400/300",
  },
  {
    id: 3,
    title: "Cross-Platform Updates",
    description: "Agentkube handles updates seamlessly across Windows, macOS, and Linux. The update system automatically detects your platform and delivers the appropriate update package.",
    imageUrl: "/api/placeholder/400/300",
  },
  {
    id: 4,
    title: "Update Progress Tracking",
    description: "Watch the update download progress in real-time. The update dialog shows how much has been downloaded and when it will be ready to install.",
    imageUrl: "/api/placeholder/400/300",
  },
  {
    id: 5,
    title: "Release Notes",
    description: "Each update comes with detailed release notes that explain what's new, what's improved, and what's fixed. Stay informed about the changes in each version.",
    imageUrl: "/api/placeholder/400/300",
  },
  {
    id: 6,
    title: "Manual Update Options",
    description: "If automatic updates fail, you can always download the latest version manually from our website. Just click the 'Later' button and visit agentkube.com/downloads.",
    imageUrl: "/api/placeholder/400/300",
  },
  {
    id: 7,
    title: "Auto-Restart After Update",
    description: "After an update is installed, Agentkube can automatically restart to apply the changes. Your work is saved, and you'll be right back where you left off.",
    imageUrl: "/api/placeholder/400/300",
  },
];