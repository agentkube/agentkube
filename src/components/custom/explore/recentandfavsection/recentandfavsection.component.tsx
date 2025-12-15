// RecentAndFavSection.tsx
import React, { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { History, Star, ChevronDown, ChevronRight } from 'lucide-react';
import { sidebarItems } from '@/constants/kubernetes-resource.constants';

interface RecentVisit {
  id: string;
  label: string;
  path: string;
  timestamp: number;
}

interface RecentAndFavSectionProps {
  isCollapsed: boolean;
}

const RECENT_VISITS_KEY = 'recent-visited-resources';
const MAX_RECENT_ITEMS = 3;

// Helper function to get icon for a resource by ID
const getResourceIcon = (resourceId: string): React.ReactNode => {
  // Search in top-level items
  for (const item of sidebarItems) {
    if (item.id === resourceId) {
      return item.icon;
    }

    // Search in children
    if (item.children) {
      const child = item.children.find(c => c.id === resourceId);
      if (child) {
        return child.icon;
      }
    }
  }

  return null;
};

const RecentAndFavSection: React.FC<RecentAndFavSectionProps> = ({ isCollapsed }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [recentVisits, setRecentVisits] = useState<RecentVisit[]>([]);
  const [isSectionCollapsed, setIsSectionCollapsed] = useState(() => {
    const saved = localStorage.getItem('recent-section-collapsed');
    return saved ? JSON.parse(saved) : true; // default to collapsed
  });

  // Check if the feature is enabled
  const [isEnabled, setIsEnabled] = useState(() => {
    const saved = localStorage.getItem('show-recent-visits');
    return saved ? JSON.parse(saved) : true;
  });

  // Listen for changes to the setting
  useEffect(() => {
    const handleStorageChange = () => {
      const saved = localStorage.getItem('show-recent-visits');
      setIsEnabled(saved ? JSON.parse(saved) : true);
    };

    window.addEventListener('storage', handleStorageChange);
    // Also check periodically in case of same-tab changes
    const interval = setInterval(handleStorageChange, 1000);

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Save section collapsed state
  useEffect(() => {
    localStorage.setItem('recent-section-collapsed', JSON.stringify(isSectionCollapsed));
  }, [isSectionCollapsed]);

  // Load recent visits from localStorage
  useEffect(() => {
    const loadRecentVisits = () => {
      try {
        const stored = localStorage.getItem(RECENT_VISITS_KEY);
        if (stored) {
          const visits: RecentVisit[] = JSON.parse(stored);
          setRecentVisits(visits.slice(0, MAX_RECENT_ITEMS));
        }
      } catch (error) {
        console.error('Failed to load recent visits:', error);
      }
    };

    loadRecentVisits();

    // Listen for changes to recent visits
    const handleStorageChange = () => {
      loadRecentVisits();
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  // Track current location and update recent visits
  useEffect(() => {
    // Only track explore routes
    if (!location.pathname.startsWith('/dashboard/explore/')) {
      return;
    }

    const pathParts = location.pathname.split('/');
    if (pathParts.length < 4) return;

    const resourceType = pathParts[3]; // e.g., 'pods', 'deployments'

    // Find the resource in sidebarItems to get the label
    let resourceInfo: { label: string } | null = null;

    // Search in top-level items
    for (const item of sidebarItems) {
      if (item.id === resourceType) {
        resourceInfo = { label: item.label };
        break;
      }

      // Search in children
      if (item.children) {
        const child = item.children.find(c => c.id === resourceType);
        if (child) {
          resourceInfo = { label: child.label };
          break;
        }
      }
    }

    if (!resourceInfo) {
      return; // Resource not found in sidebar items
    }

    const newVisit: RecentVisit = {
      id: resourceType,
      label: resourceInfo.label,
      path: location.pathname,
      timestamp: Date.now()
    };

    // Update recent visits
    setRecentVisits(prev => {
      // Remove duplicates and add new visit at the beginning
      const filtered = prev.filter(v => v.id !== resourceType);
      const updated = [newVisit, ...filtered].slice(0, MAX_RECENT_ITEMS);

      // Save to localStorage
      try {
        localStorage.setItem(RECENT_VISITS_KEY, JSON.stringify(updated));
      } catch (error) {
        console.error('Failed to save recent visits:', error);
      }

      return updated;
    });
  }, [location.pathname]);

  // If feature is disabled, don't render anything
  if (!isEnabled) {
    return null;
  }

  // If no recent visits, don't render
  if (recentVisits.length === 0) {
    return null;
  }

  const toggleSectionCollapse = () => {
    setIsSectionCollapsed(!isSectionCollapsed);
  };

  const handleVisitClick = (visit: RecentVisit) => {
    navigate(visit.path);
  };

  return (
    <div className="flex flex-col mb-2">
      {/* Section Header */}
      <button
        className="flex items-center justify-between px-2 py-1 cursor-pointer hover:bg-accent-hover"
        onClick={toggleSectionCollapse}
        aria-label={isSectionCollapsed ? "Expand recent visits" : "Collapse recent visits"}
      >
        <div className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          {!isCollapsed && (
            <>
              Recent Visits
            </>
          )}
        </div>
        {!isCollapsed && (
          <span className="mr-1">
            {isSectionCollapsed ? (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-3 h-3 text-muted-foreground" />
            )}
          </span>
        )}
      </button>

      {/* Recent Visits List - Expanded View */}
      {!isSectionCollapsed && !isCollapsed && (
        <div className="flex flex-col px-2 py-1 space-y-1">
          {recentVisits.map((visit) => (
            <button
              key={visit.id}
              className={`flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-accent text-left transition-colors ${location.pathname === visit.path ? 'bg-accent' : ''
                }`}
              onClick={() => handleVisitClick(visit)}
              title={visit.label}
            >
              <span className="text-muted-foreground">{getResourceIcon(visit.id)}</span>
              <span className="text-xs text-foreground truncate">{visit.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* Recent Visits - Collapsed Sidebar View */}
      {!isSectionCollapsed && isCollapsed && (
        <div className="flex flex-col space-y-1 pt-1 px-2">
          {recentVisits.map((visit) => (
            <button
              key={visit.id}
              className={`w-full flex justify-center items-center p-2 hover:bg-accent rounded-[5px] transition-colors relative group ${location.pathname === visit.path ? 'bg-accent' : ''
                }`}
              onClick={() => handleVisitClick(visit)}
              title={visit.label}
            >
              {getResourceIcon(visit.id)}
              {/* Tooltip */}
              <div className="absolute left-full ml-2 -mt-8 z-10 bg-card backdrop-blur-md text-card-foreground text-sm rounded-md px-2 py-1 whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 border-r-2 border-blue-700">
                <p className="font-medium">{visit.label}</p>
                <div className="absolute w-2 h-2 bg-card rotate-45 left-0 top-1/2 -translate-y-1/2 -translate-x-1/2"></div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default RecentAndFavSection;
