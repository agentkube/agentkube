export const parseSearchQuery = (query: string): { cleanQuery: string; namespace?: string } => {
  // Check if query contains @namespace syntax
  const namespaceMatch = query.match(/@(\w+)/);
  
  if (namespaceMatch) {
    const namespace = namespaceMatch[1];
    // Remove the @namespace part from the query
    const cleanQuery = query.replace(/@\w+/g, '').trim();
    return { cleanQuery, namespace };
  }
  
  return { cleanQuery: query };
};