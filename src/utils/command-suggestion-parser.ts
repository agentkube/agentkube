interface CommandSuggestion {
  command: string;
  description: string;
}

const resourceMap = {
  // Workloads
  'pod': 'pods',
  'pods': 'pods',
  'deployment': 'deployments',
  'deployments': 'deployments',
  'daemonset': 'daemonsets',
  'daemonsets': 'daemonsets',
  'statefulset': 'statefulsets',
  'statefulsets': 'statefulsets',
  'replicaset': 'replicasets',
  'replicasets': 'replicasets',
  'replicationcontroller': 'replicationcontrollers',
  'replicationcontrollers': 'replicationcontrollers',
  'job': 'jobs',
  'jobs': 'jobs',
  'cronjob': 'cronjobs',
  'cronjobs': 'cronjobs',
  
  // Rest of the resource map remains same...
};

const namespacePatterns = [
  /in\s+(\w+[-\w]*)\s+(namespace|ns)/i,  // "in default namespace"
  /in\s+(namespace|ns)\s+(\w+[-\w]*)/i,  // "in namespace default"
  /(\w+[-\w]*)\s+(namespace|ns)/i,       // "default namespace"
  /--namespace[=\s]+(\w+[-\w]*)/i,       // "--namespace default"
  /-n[=\s]+(\w+[-\w]*)/i                 // "-n default"
];

// Create pattern from resourceMap keys
const resourceTypes = Object.keys(resourceMap).join('|');
const resourcePatterns = [
  new RegExp(`^(${resourceTypes})\\s+`, 'i'),
  new RegExp(`^get\\s+(${resourceTypes})`, 'i'),
  new RegExp(`^show\\s+(${resourceTypes})`, 'i'),
  new RegExp(`^list\\s+(${resourceTypes})`, 'i'),
  new RegExp(`^display\\s+(${resourceTypes})`, 'i'),
  new RegExp(`^view\\s+(${resourceTypes})`, 'i'),
  new RegExp(`^describe\\s+(${resourceTypes})`, 'i'),
];

const resourceNamePattern = /\b([a-z0-9]([-a-z0-9]*[a-z0-9])?)\b(?=\s|$)/i;

export const parseNaturalLanguage = (query: string): CommandSuggestion[] => {
  const suggestions: CommandSuggestion[] = [];
  if (!query) return suggestions;

  // Normalize query
  const normalizedQuery = query.toLowerCase().trim();
  
  // Extract resource type
  let resourceType = '';
  let verb = 'get'; // default verb
  
  for (const pattern of resourcePatterns) {
    const match = normalizedQuery.match(pattern);
    if (match) {
      if (match[0].startsWith('describe')) {
        verb = 'describe';
      }
      resourceType = resourceMap[match[1] as keyof typeof resourceMap] || match[1];
      break;
    }
  }

  // Try to find resource type anywhere in the query if not found at start
  if (!resourceType) {
    const words = normalizedQuery.split(/\s+/);
    for (const word of words) {
      if (resourceMap[word as keyof typeof resourceMap]) {
        resourceType = resourceMap[word as keyof typeof resourceMap];
        break;
      }
    }
  }

  if (!resourceType) return suggestions;

  // Extract namespace
  let namespace = '';
  for (const pattern of namespacePatterns) {
    const match = normalizedQuery.match(pattern);
    if (match) {
      // If pattern contains "namespace" or "ns" as a capturing group
      if (match[1] === 'namespace' || match[1] === 'ns') {
        namespace = match[2];
      } else {
        namespace = match[1];
      }
      break;
    }
  }

  // Extract resource name (excluding namespace-related words)
  const words = normalizedQuery.split(/\s+/);
  const possibleNames = words.filter(word => 
    word !== 'in' && 
    word !== 'ns' && 
    word !== 'namespace' && 
    word !== verb &&
    word !== namespace &&
    !Object.keys(resourceMap).includes(word)
  );
  
  const resourceName = possibleNames.find(name => resourceNamePattern.test(name));

  // Generate base suggestion
  suggestions.push({
    command: `kubectl ${verb} ${resourceType}`,
    description: `${verb === 'get' ? 'List' : 'Describe'} all ${resourceType}`
  });

  // If namespace is specified, that should be primary suggestion
  if (namespace) {
    suggestions.unshift({
      command: `kubectl ${verb} ${resourceType} --namespace ${namespace}`,
      description: `${verb === 'get' ? 'List' : 'Describe'} ${resourceType} in namespace ${namespace}`
    });

    if (resourceName) {
      suggestions.unshift({
        command: `kubectl ${verb} ${resourceType} ${resourceName} --namespace ${namespace}`,
        description: `${verb === 'get' ? 'Get details of' : 'Describe'} ${resourceName} ${resourceType} in namespace ${namespace}`
      });
    }
  } else {
    // If no namespace specified, show all-namespaces option
    if (resourceType !== 'nodes' && resourceType !== 'namespaces') {
      suggestions.push({
        command: `kubectl ${verb} ${resourceType} --all-namespaces`,
        description: `${verb === 'get' ? 'List' : 'Describe'} ${resourceType} across all namespaces`
      });
    }

    if (resourceName) {
      suggestions.unshift({
        command: `kubectl ${verb} ${resourceType} ${resourceName}`,
        description: `${verb === 'get' ? 'Get details of' : 'Describe'} ${resourceName} ${resourceType}`
      });
    }
  }

  return suggestions;
}