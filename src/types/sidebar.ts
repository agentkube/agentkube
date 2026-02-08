export interface SidebarItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  path?: string;
  children?: SidebarItem[];
  isExpanded?: boolean;
  content?: string;
}
export interface Tab {
  id: string;
  label: string;
  content: string;
}

export interface FeatureItem {
  id: string;
  icon: React.ReactNode;
  label: string;
  path: string;
  children?: FeatureItem[];
}
