// FeatureSection.tsx
import React from 'react';
import { ChevronDown, ChevronRight, Book, TextSearch, Code, BotMessageSquare, ShieldUser, CircleDollarSign, ChartLine, PiggyBank } from 'lucide-react';
import FeatureMenuItem from '../featuremenuitem/featuremenuitem.component';
import { FeatureItem } from '@/types/sidebar';
import { OPENAI_PROVIDER, OPENCOST } from '@/assets/providers';

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
  {
    id: 'runbooks',
    icon: <Book className="w-4 h-4" />,
    label: 'Runbooks',
    path: '/dashboard/runbooks'
  },
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
  {
    id: 'talk-to-cluster',
    icon: <BotMessageSquare className="w-4 h-4" />,
    label: 'Talk to Cluster',
    path: '/dashboard/talk2cluster'
  },
  {
    id: 'monitoring',
    icon: <ChartLine className="w-4 h-4" />,
    label: 'Monitoring',
    path: '/dashboard/monitoring'
  },
  {
    id: 'security',
    icon: <ShieldUser className="w-4 h-4" />,
    label: 'Security',
    path: '/dashboard/security',
    children: [
      {
        id: 'best-practices',
        icon: <div className="w-2 h-2 rounded-full bg-green-500 ml-1 mr-2" />,
        label: 'Best Practices',
        path: '/dashboard/security/best-practices'
      },
      {
        id: 'vulnerability-reports',
        icon: <div className="w-2 h-2 rounded-full bg-yellow-500 ml-1 mr-2" />,
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
      {
        id: 'llm-comparison',
        icon: <img src={OPENAI_PROVIDER} alt="OpenAI" className="w-4 h-4" />,
        label: 'LLM Comparison',
        path: '/dashboard/llm-comparison'
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
      
      {!isAdvancedCollapsed && (
        <div className="flex flex-col space-y-1 pt-1">
          {advancedFeatures.map(feature => (
            <FeatureMenuItem
              key={feature.id}
              feature={feature}
              isCollapsed={isCollapsed}
              expandedFeatures={expandedFeatures}
              selectedFeaturePath={locationPathname}
              onFeatureClick={onFeatureClick}
              onExpandToggle={onFeatureExpandToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
};

export default FeatureSection;
export { advancedFeatures };