const CLUSTER_LAST_VISITED_KEY = 'cluster-last-visited-locations';

export interface ClusterLastVisited {
  [clusterId: string]: string;
}

export const ClusterNavigationStorage = {
  getLastVisitedLocation: (clusterId: string): string | null => {
    try {
      const stored = localStorage.getItem(CLUSTER_LAST_VISITED_KEY);
      if (!stored) return null;
      
      const clusterLocations: ClusterLastVisited = JSON.parse(stored);
      return clusterLocations[clusterId] || null;
    } catch (error) {
      console.error('Error reading cluster last visited locations:', error);
      return null;
    }
  },

  setLastVisitedLocation: (clusterId: string, location: string): void => {
    try {
      const stored = localStorage.getItem(CLUSTER_LAST_VISITED_KEY);
      const clusterLocations: ClusterLastVisited = stored ? JSON.parse(stored) : {};
      
      clusterLocations[clusterId] = location;
      
      localStorage.setItem(CLUSTER_LAST_VISITED_KEY, JSON.stringify(clusterLocations));
    } catch (error) {
      console.error('Error storing cluster last visited location:', error);
    }
  },

  removeLastVisitedLocation: (clusterId: string): void => {
    try {
      const stored = localStorage.getItem(CLUSTER_LAST_VISITED_KEY);
      if (!stored) return;
      
      const clusterLocations: ClusterLastVisited = JSON.parse(stored);
      delete clusterLocations[clusterId];
      
      localStorage.setItem(CLUSTER_LAST_VISITED_KEY, JSON.stringify(clusterLocations));
    } catch (error) {
      console.error('Error removing cluster last visited location:', error);
    }
  },

  clearAllLastVisited: (): void => {
    try {
      localStorage.removeItem(CLUSTER_LAST_VISITED_KEY);
    } catch (error) {
      console.error('Error clearing cluster last visited locations:', error);
    }
  }
};