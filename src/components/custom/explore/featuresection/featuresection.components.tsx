// FeatureSection.tsx
import React from 'react';
import { ChevronDown, ChevronRight, Book, TextSearch, Code, BotMessageSquare, ShieldUser, CircleDollarSign, ChartLine, PiggyBank, Drill, Compass, ShieldEllipsis, ShieldCheck, ShieldAlert, Brain } from 'lucide-react';
import { FeatureItem } from '@/types/sidebar';
import { TreeProvider, TreeView, TreeNode, TreeNodeTrigger, TreeNodeContent, TreeExpander, TreeIcon, TreeLabel } from '@/components/ui/tree';

interface FeatureSectionProps {
  isCollapsed: boolean;
  isAdvancedCollapsed: boolean;
  toggleAdvancedCollapse: () => void;
  expandedFeatures: string[];
  locationPathname: string;
  onFeatureClick: (feature: FeatureItem) => void;
  onFeatureExpandToggle: (featureId: string) => void;
}

// Define advanced features
const advancedFeatures: FeatureItem[] = [
  // {
  //   id: 'runbooks',
  //   icon: <Book className="w-4 h-4" />,
  //   label: 'Runbooks',
  //   path: '/dashboard/runbooks'
  // },
  {
    id: 'investigations',
    icon: <TextSearch className="w-4 h-4" />,
    label: 'Investigations',
    path: '/dashboard/investigations'
  },
  {
    id: 'editor',
    icon: <Code className="w-4 h-4" />,
    label: 'AI Editor',
    path: '/dashboard/editor'
  },
  // {
  //   id: 'talk-to-cluster',
  //   icon: <BotMessageSquare className="w-4 h-4" />,
  //   label: 'Talk to Cluster',
  //   path: '/dashboard/talk2cluster'
  // },
  {
    id: 'monitoring',
    icon: <ChartLine className="w-4 h-4" />,
    label: 'Monitoring',
    path: '/dashboard/monitoring',
    children: [
      {
        id: 'monitoring-overview',
        icon: <Compass className="w-4 h-4" />,
        label: 'Overview',
        path: '/dashboard/monitoring'
      },
      // {
      //   id: 'drilldown',
      //   icon: <Drill className="w-4 h-4 rotate-[25deg]" />,
      //   label: 'Drilldown',
      //   path: '/dashboard/monitoring/drilldown'
      // },
    ]
  },
  {
    id: 'security',
    icon: <ShieldUser className="w-4 h-4" />,
    label: 'Security',
    path: '/dashboard/security',
    children: [
      {
        id: 'audit-report',
        icon: <ShieldCheck className="w-4 h-4" />,
        label: 'Audit Report',
        path: '/dashboard/security/audit-report'
      },
      {
        id: 'vulnerability-reports',
        icon: <ShieldAlert className="w-4 h-4" />,
        label: 'Vulnerability Reports',
        path: '/dashboard/security/vulnerability-report'
      },
      // {
      //   id: 'image-security',
      //   icon: <div className="w-2 h-2 rounded-full bg-blue-500 ml-1 mr-2" />,
      //   label: 'Image Security [Coming Soon]',
      //   path: '/dashboard/security/image-security'
      // }
    ]
  },
  {
    id: 'optimizations',
    icon: <CircleDollarSign className="w-4 h-4" />,
    label: 'Cost Monitoring',
    path: '/dashboard/cost',
    children: [
      {
        id: 'cost-overview',
        icon: <PiggyBank className="w-4 h-4" />,
        label: 'Cost Overview',
        path: '/dashboard/cost'
      },
      // {
      //   id: 'cost-monitors',
      //   icon: <div className="w-2 h-2 rounded-full bg-yellow-500 ml-1 mr-2" />,
      //   label: 'Cost Monitors',
      //   path: '/dashboard/cost-optimization/vulnerability-scans'
      // },
      // {
      //   id: 'ai-optimizer',
      //   icon: <div className="w-2 h-2 rounded-full bg-green-500 ml-1 mr-2" />,
      //   label: 'AI Optimizer',
      //   path: '/dashboard/cost/ai-optimization'
      // }
    ]
  }
];

const FeatureSection: React.FC<FeatureSectionProps> = ({
  isCollapsed,
  isAdvancedCollapsed,
  toggleAdvancedCollapse,
  expandedFeatures,
  locationPathname,
  onFeatureClick,
  onFeatureExpandToggle
}) => {
  // Convert current selected path to array format for tree
  const getSelectedIds = () => {
    const selectedFeature = advancedFeatures.find(f => f.path === locationPathname);
    if (selectedFeature) return [selectedFeature.id];
    
    // Check if a child is selected
    for (const feature of advancedFeatures) {
      if (feature.children) {
        const selectedChild = feature.children.find(c => c.path === locationPathname);
        if (selectedChild) return [selectedChild.id];
      }
    }
    return [];
  };

  const handleFeatureSelect = (nodeIds: string[]) => {
    if (nodeIds.length === 0) return;
    
    const nodeId = nodeIds[0];
    
    // Find the feature by ID
    const feature = advancedFeatures.find(f => f.id === nodeId);
    if (feature) {
      // Check if this is a parent with children
      const hasChildren = feature.children && feature.children.length > 0;
      
      if (hasChildren && feature.children) {
        // If parent has multiple children, don't navigate - just expand
        if (feature.children.length > 1) {
          return; // Don't navigate, just expand/collapse
        } else {
          // If parent has single child, navigate to the child
          onFeatureClick(feature.children[0]);
          return;
        }
      } else {
        // Leaf item - navigate normally
        onFeatureClick(feature);
        return;
      }
    }
    
    // Check children (leaf items)
    for (const parentFeature of advancedFeatures) {
      if (parentFeature.children) {
        const childFeature = parentFeature.children.find(c => c.id === nodeId);
        if (childFeature) {
          onFeatureClick(childFeature);
          return;
        }
      }
    }
  };

  const renderFeatureNode = (feature: FeatureItem, level: number = 0, isLast: boolean = false) => {
    const hasChildren = feature.children && feature.children.length > 0;
    
    return (
      <TreeNode key={feature.id} nodeId={feature.id} level={level} isLast={isLast}>
        <TreeNodeTrigger>
          <TreeExpander hasChildren={hasChildren} />
          <TreeIcon icon={feature.icon} hasChildren={hasChildren} />
          <TreeLabel className='dark:text-gray-300'>{feature.label}</TreeLabel>
        </TreeNodeTrigger>
        {hasChildren && (
          <TreeNodeContent hasChildren={hasChildren}>
            {feature.children?.map((child, index) => 
              renderFeatureNode(child, level + 1, index === (feature.children?.length || 0) - 1)
            )}
          </TreeNodeContent>
        )}
      </TreeNode>
    );
  };

  return (
    <div className="flex flex-col mb-2">
      <button 
        className="flex items-center justify-between px-2 py-1 cursor-pointer hover:bg-gray-300/10"
        onClick={toggleAdvancedCollapse}
        aria-label={isAdvancedCollapsed ? "Expand advanced features" : "Collapse advanced features"}
      >
        <div className="text-xs font-medium text-gray-800 dark:text-gray-500">
          {!isCollapsed && "Advanced Features"}
        </div>
        {!isCollapsed && (
          <span className="mr-1">
            {isAdvancedCollapsed ? (
              <ChevronRight className="w-3 h-3 text-gray-800 dark:text-gray-500" />
            ) : (
              <ChevronDown className="w-3 h-3 text-gray-800 dark:text-gray-500" />
            )}
          </span>
        )}
      </button>
      
      {!isAdvancedCollapsed && !isCollapsed && (
        <div className="pt-1">
          <TreeProvider
            defaultExpandedIds={expandedFeatures}
            selectedIds={getSelectedIds()}
            onSelectionChange={handleFeatureSelect}
            showLines={true}
            showIcons={true}
            selectable={true}
            multiSelect={false}
            indent={16}
            animateExpand={true}
          >
            <TreeView className="p-0">
              {advancedFeatures.map((feature, index) => 
                renderFeatureNode(feature, 0, index === advancedFeatures.length - 1)
              )}
            </TreeView>
          </TreeProvider>
        </div>
      )}
      
      {/* Collapsed view - show icons only */}
      {!isAdvancedCollapsed && isCollapsed && (
        <div className="flex flex-col space-y-1 pt-1 px-2">
          {advancedFeatures.map(feature => (
            <button
              key={feature.id}
              className="w-full flex justify-center items-center p-2 hover:bg-gray-400/20 rounded-[5px] transition-colors relative group"
              onClick={() => onFeatureClick(feature)}
              title={feature.label}
            >
              {feature.icon}
              {/* Tooltip */}
              <div className="absolute left-full ml-2 -mt-8 z-10 bg-gray-200 dark:bg-[#0B0D13]/30 backdrop-blur-md  dark:text-white text-sm rounded-md px-2 py-1 whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border-r-2 border-blue-700">
                <p className="font-medium">{feature.label}</p>
                <div className="absolute w-2 h-2 bg-gray-200 dark:bg-gray-900 rotate-45 left-0 top-1/2 -translate-y-1/2 -translate-x-1/2"></div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default FeatureSection;
export { advancedFeatures };