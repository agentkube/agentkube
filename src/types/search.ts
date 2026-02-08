export interface SearchResult {
  namespace: string;
  group: string;
  version: string;
  resourceType: string;
  resourceName: string;
  namespaced: boolean;
}

export interface EnrichedSearchResult extends SearchResult {
  resourceContent?: string;
}

export interface SearchResponse {
  results: SearchResult[];
  count: number;
  query: string;
  cluster: string;
}
