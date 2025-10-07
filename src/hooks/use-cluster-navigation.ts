import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { ClusterNavigationStorage } from '@/utils/clusterNavigation';
import { useCluster } from '@/contexts/clusterContext';

export const useClusterNavigation = () => {
  const location = useLocation();
  const { currentContext } = useCluster();

  useEffect(() => {
    const pathname = location.pathname;

    // Only track dashboard routes that are NOT the base dashboard route
    // and when we have a current cluster context
    if (pathname.startsWith('/dashboard') && currentContext && pathname !== '/dashboard') {
      const locationToStore = pathname + location.search;
      ClusterNavigationStorage.setLastVisitedLocation(currentContext.name, locationToStore);
    }
  }, [location.pathname, location.search, currentContext]);

  return {
    getLastVisitedLocation: ClusterNavigationStorage.getLastVisitedLocation,
    setLastVisitedLocation: ClusterNavigationStorage.setLastVisitedLocation,
    removeLastVisitedLocation: ClusterNavigationStorage.removeLastVisitedLocation,
    clearAllLastVisited: ClusterNavigationStorage.clearAllLastVisited
  };
};