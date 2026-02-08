export interface ColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  canToggle?: boolean; // Some columns might be required and non-toggleable
  children?: ColumnConfig[]; // For hierarchical columns
  isExpandable?: boolean; // Whether this group can be expanded/collapsed
}
