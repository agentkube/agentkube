// utils/yaml.ts
import * as YAML from 'yaml';

export const jsonToYaml = (jsonData: any): string => {
  try {
    // Remove Kubernetes metadata that shouldn't be edited
    if (jsonData && typeof jsonData === 'object') {
      const cleanedData = { ...jsonData };
      if (cleanedData.metadata) {
        // const { metadata } = cleanedData;
        // const cleanedMetadata = {
        //   name: metadata.name,
        //   namespace: metadata.namespace,
        //   labels: metadata.labels,
        //   annotations: metadata.annotations,
        //   ownerReferences: metadata.ownerReferences
        // };
        // cleanedData.metadata = cleanedMetadata;
        const { metadata: { managedFields, ...restMetadata } } = cleanedData;
        cleanedData.metadata = restMetadata;
      }
      
      
      // Convert to YAML using the yaml library
      return YAML.stringify(cleanedData, {
        indent: 2,
        lineWidth: -1
      });
    }
    return '';
  } catch (error) {
    console.error('Error converting JSON to YAML:', error);
    return '';
  }
};

// utils/yaml.ts
export const yamlToJson = (yamlString: string): any => {
  try {
    // Parse YAML string to JSON object
    const jsonData = YAML.parse(yamlString);
    
    // Return the parsed data
    return jsonData;
  } catch (error) {
    console.error('Error converting YAML to JSON:', error);
    throw new Error(`Failed to parse YAML: ${error}`);
  }
};


export const cleanMetadataForUpdate = (jsonContent: any) => {
  if (!jsonContent || !jsonContent.metadata) {
    return jsonContent;
  }

  // Create a deep copy to avoid mutating the original
  const cleanedContent = JSON.parse(JSON.stringify(jsonContent));
  
  // Remove fields that cause conflicts during updates
  const fieldsToRemove = [
    'uid',
    'resourceVersion', 
    'creationTimestamp',
    'generation',
    'managedFields',
    'selfLink',
    'finalizers'
  ];

  fieldsToRemove.forEach(field => {
    if (cleanedContent.metadata[field]) {
      delete cleanedContent.metadata[field];
    }
  });

  // Also clean status field if it exists (read-only)
  if (cleanedContent.status) {
    delete cleanedContent.status;
  }

  return cleanedContent;
};