import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { PlusCircle, Trash2, Edit, Server, Globe, Database, Lock, ShieldCheck } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { createResource } from '@/api/internal/resources';
import { toast } from '@/hooks/use-toast';
import { yamlToJson, jsonToYaml } from '@/utils/yaml';

interface GuiResourceEditorProps {
  onUpdateYaml: (yaml: string) => void;
}

// Define a type for the ConfigMap and Secret
type ConfigResource = {
  apiVersion: string;
  kind: string;
  metadata: { name: string };
  data: { [key: string]: string };
  type?: string; // Optional type for Secrets
};

// Define a type for the workload spec
type WorkloadSpec = {
  selector: {
    matchLabels: {
      app: string;
    };
  };
  template: {
    metadata: {
      labels: {
        app: string;
      };
    };
    spec: {
      containers: {
        name: string;
        image: string;
        ports: { containerPort: number }[];
        resources: {
          requests: {
            cpu: string;
            memory: string;
          };
          limits: {
            cpu: string;
            memory: string;
          };
        };
      }[];
    };
  };
  replicas?: number; // Optional replicas property
};

const GuiResourceEditor: React.FC<GuiResourceEditorProps> = ({ onUpdateYaml }) => {
  const { currentContext } = useCluster();
  const { selectedNamespaces, namespaces } = useNamespace();

  const [selectedTab, setSelectedTab] = useState("workloads");
  const [newNamespace, setNewNamespace] = useState("");
  const [createNamespaceLoading, setCreateNamespaceLoading] = useState(false);

  // Workloads state
  const [workloadType, setWorkloadType] = useState("deployment");
  const [workloadName, setWorkloadName] = useState("");
  const [replicas, setReplicas] = useState(1);
  const [containerImage, setContainerImage] = useState("");
  const [containerPort, setContainerPort] = useState(80);
  const [cpuRequests, setCpuRequests] = useState("100m");
  const [memoryRequests, setMemoryRequests] = useState("128Mi");
  const [cpuLimits, setCpuLimits] = useState("200m");
  const [memoryLimits, setMemoryLimits] = useState("256Mi");

  // Networking state
  const [serviceType, setServiceType] = useState("ClusterIP");
  const [serviceName, setServiceName] = useState("");
  const [servicePort, setServicePort] = useState(80);
  const [targetPort, setTargetPort] = useState(80);
  const [createIngress, setCreateIngress] = useState(false);
  const [ingressHost, setIngressHost] = useState("");
  const [ingressPath, setIngressPath] = useState("/");

  // Storage state
  const [volumeName, setVolumeName] = useState("");
  const [volumeSize, setVolumeSize] = useState("1Gi");
  const [storageClass, setStorageClass] = useState("standard");
  const [accessMode, setAccessMode] = useState("ReadWriteOnce");

  // Config state
  const [configType, setConfigType] = useState("configmap");
  const [configName, setConfigName] = useState("");
  const [configData, setConfigData] = useState([{ key: "", value: "" }]);

  // Access Control state
  const [serviceAccountName, setServiceAccountName] = useState("");
  const [roleName, setRoleName] = useState("");
  const [rules, setRules] = useState([
    { apiGroups: [""], resources: ["pods"], verbs: ["get", "list", "watch"] }
  ]);

  // Handle namespace creation
  const handleCreateNamespace = async () => {
    if (!newNamespace.trim()) {
      toast({
        title: "Error",
        description: "Namespace name cannot be empty",
        variant: "destructive"
      });
      return;
    }

    if (!currentContext?.name) {
      toast({
        title: "Error",
        description: "No cluster context selected",
        variant: "destructive"
      });
      return;
    }

    setCreateNamespaceLoading(true);

    try {
      const namespaceResource = {
        apiVersion: "v1",
        kind: "Namespace",
        metadata: {
          name: newNamespace.trim()
        }
      };

      await createResource(currentContext.name, 'namespaces', namespaceResource);

      toast({
        title: "Success",
        description: `Namespace "${newNamespace}" created successfully.`,
        variant: "success"
      });

      setNewNamespace("");
      // refreshNamespaces();
    } catch (error) {
      console.error('Failed to create namespace:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to create namespace",
        variant: "destructive"
      });
    } finally {
      setCreateNamespaceLoading(false);
    }
  };

  // Add a new config data entry
  const addConfigData = () => {
    setConfigData([...configData, { key: "", value: "" }]);
  };

  // Update config data
  const updateConfigData = (index: number, field: 'key' | 'value', value: string) => {
    const updated = [...configData];
    updated[index][field] = value;
    setConfigData(updated);
  };

  // Remove config data entry
  const removeConfigData = (index: number) => {
    const updated = [...configData];
    updated.splice(index, 1);
    setConfigData(updated);
  };

  // Generate deployment YAML
  const generateWorkloadYaml = () => {
    if (!workloadName || !containerImage) {
      toast({
        title: "Error",
        description: "Workload name and container image are required",
        variant: "destructive"
      });
      return;
    }

    let resource = {
      apiVersion: workloadType === 'deployment' ? 'apps/v1' :
        workloadType === 'statefulset' ? 'apps/v1' :
          'apps/v1', // daemonset
      kind: workloadType === 'deployment' ? 'Deployment' :
        workloadType === 'statefulset' ? 'StatefulSet' :
          'DaemonSet',
      metadata: {
        name: workloadName,
        labels: {
          app: workloadName
        }
      },
      spec: {} as WorkloadSpec // Use the defined type here
    };

    // Add the common spec properties
    resource.spec.selector = {
      matchLabels: {
        app: workloadName
      }
    };
    resource.spec.template = {
      metadata: {
        labels: {
          app: workloadName
        }
      },
      spec: {
        containers: [
          {
            name: workloadName,
            image: containerImage,
            ports: [
              {
                containerPort: containerPort
              }
            ],
            resources: {
              requests: {
                cpu: cpuRequests,
                memory: memoryRequests
              },
              limits: {
                cpu: cpuLimits,
                memory: memoryLimits
              }
            }
          }
        ]
      }
    };

    // Add replicas for Deployment and StatefulSet, not for DaemonSet
    if (workloadType !== 'daemonset') {
      resource.spec.replicas = replicas; // Now this is valid
    }

    const yaml = jsonToYaml(resource);
    onUpdateYaml(yaml);

    toast({
      title: "Generated",
      description: `${workloadType} YAML has been generated`,
      variant: "success"
    });
  };

  // Generate networking YAML
  const generateNetworkingYaml = () => {
    if (!serviceName) {
      toast({
        title: "Error",
        description: "Service name is required",
        variant: "destructive"
      });
      return;
    }

    // Create service resource
    const serviceResource = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: serviceName
      },
      spec: {
        type: serviceType,
        selector: {
          app: workloadName || serviceName
        },
        ports: [
          {
            port: servicePort,
            targetPort: targetPort,
            protocol: 'TCP',
            name: 'http'
          }
        ]
      }
    };

    // Create ingress if requested
    if (createIngress) {
      if (!ingressHost) {
        toast({
          title: "Error",
          description: "Ingress host is required",
          variant: "destructive"
        });
        return;
      }

      const ingressResource = {
        apiVersion: 'networking.k8s.io/v1',
        kind: 'Ingress',
        metadata: {
          name: `${serviceName}-ingress`
        },
        spec: {
          rules: [
            {
              host: ingressHost,
              http: {
                paths: [
                  {
                    path: ingressPath,
                    pathType: 'Prefix',
                    backend: {
                      service: {
                        name: serviceName,
                        port: {
                          number: servicePort
                        }
                      }
                    }
                  }
                ]
              }
            }
          ]
        }
      };

      // Combine the service and ingress YAML
      const serviceYaml = jsonToYaml(serviceResource);
      const ingressYaml = jsonToYaml(ingressResource);
      onUpdateYaml(`${serviceYaml}\n---\n${ingressYaml}`);

      toast({
        title: "Generated",
        description: "Service and Ingress YAML have been generated",
        variant: "success"
      });
    } else {
      // Just service YAML
      const yaml = jsonToYaml(serviceResource);
      onUpdateYaml(yaml);

      toast({
        title: "Generated",
        description: "Service YAML has been generated",
        variant: "success"
      });
    }
  };

  // Generate storage YAML
  const generateStorageYaml = () => {
    if (!volumeName) {
      toast({
        title: "Error",
        description: "Volume name is required",
        variant: "destructive"
      });
      return;
    }

    const pvcResource = {
      apiVersion: 'v1',
      kind: 'PersistentVolumeClaim',
      metadata: {
        name: volumeName
      },
      spec: {
        accessModes: [accessMode],
        resources: {
          requests: {
            storage: volumeSize
          }
        },
        storageClassName: storageClass
      }
    };

    const yaml = jsonToYaml(pvcResource);
    onUpdateYaml(yaml);

    toast({
      title: "Generated",
      description: "PVC YAML has been generated",
      variant: "success"
    });
  };

  // Generate config YAML (ConfigMap or Secret)
  const generateConfigYaml = () => {
    if (!configName) {
      toast({
        title: "Error",
        description: "Config name is required",
        variant: "destructive"
      });
      return;
    }

    if (configData.some(item => !item.key.trim())) {
      toast({
        title: "Error",
        description: "All config keys must be specified",
        variant: "destructive"
      });
      return;
    }

    // Update the configResource definition
    const configResource: ConfigResource = {
      apiVersion: 'v1',
      kind: configType === 'configmap' ? 'ConfigMap' : 'Secret',
      metadata: {
        name: configName
      },
      data: {} as { [key: string]: string }
    };

    // Set the type for Secrets
    if (configType === 'secret') {
      configResource.type = 'Opaque';
    }

    // For configmaps, just use the raw values
    configData.forEach(item => {
      if (item.key && item.value) {
        configResource.data[item.key] = item.value;
      }
    });

    const yaml = jsonToYaml(configResource);
    onUpdateYaml(yaml);

    toast({
      title: "Generated",
      description: `${configType === 'configmap' ? 'ConfigMap' : 'Secret'} YAML has been generated`,
      variant: "success"
    });
  };

  // Generate access control YAML
  const generateAccessControlYaml = () => {
    if (!serviceAccountName) {
      toast({
        title: "Error",
        description: "Service Account name is required",
        variant: "destructive"
      });
      return;
    }

    if (!roleName) {
      toast({
        title: "Error",
        description: "Role name is required",
        variant: "destructive"
      });
      return;
    }

    // Create service account
    const serviceAccountResource = {
      apiVersion: 'v1',
      kind: 'ServiceAccount',
      metadata: {
        name: serviceAccountName
      }
    };

    // Create role
    const roleResource = {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'Role',
      metadata: {
        name: roleName
      },
      rules: rules
    };

    // Create role binding
    const roleBindingResource = {
      apiVersion: 'rbac.authorization.k8s.io/v1',
      kind: 'RoleBinding',
      metadata: {
        name: `${roleName}-binding`
      },
      subjects: [
        {
          kind: 'ServiceAccount',
          name: serviceAccountName,
          namespace: 'default'
        }
      ],
      roleRef: {
        kind: 'Role',
        name: roleName,
        apiGroup: 'rbac.authorization.k8s.io'
      }
    };

    // Combine all YAML documents
    const serviceAccountYaml = jsonToYaml(serviceAccountResource);
    const roleYaml = jsonToYaml(roleResource);
    const roleBindingYaml = jsonToYaml(roleBindingResource);

    onUpdateYaml(`${serviceAccountYaml}\n---\n${roleYaml}\n---\n${roleBindingYaml}`);

    toast({
      title: "Generated",
      description: "ServiceAccount, Role, and RoleBinding YAML have been generated",
      variant: "success"
    });
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-4 pb-4">
        <Card className="bg-gray-50 dark:bg-transparent mb-4">
          <CardContent className="p-4">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <Label className="text-sm font-medium">Current Namespace</Label>
                <Select
                  // value={selectedNamespaces[0]?.metadata?.name || ""}
                  // onValueChange={(value) => setState({ selectedNamespaces: [value] })}
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select a namespace" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem key="default" value="default">
                      default
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex-1">
                <Label className="text-sm font-medium">Create New Namespace</Label>
                <div className="flex gap-2 mt-1">
                  <Input
                    placeholder="new-namespace"
                    value={newNamespace}
                    onChange={(e) => setNewNamespace(e.target.value)}
                  />
                  <Button
                    onClick={handleCreateNamespace}
                    disabled={createNamespaceLoading || !newNamespace}
                    size="sm"
                  >
                    {createNamespaceLoading ? "Creating..." : "Create"}
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={selectedTab} onValueChange={setSelectedTab} className="w-full">
          <TabsList className="grid grid-cols-5 mb-4">
            <TabsTrigger value="workloads">
              <Server className="h-4 w-4 mr-2" /> Workloads
            </TabsTrigger>
            <TabsTrigger value="networking">
              <Globe className="h-4 w-4 mr-2" /> Networking
            </TabsTrigger>
            <TabsTrigger value="storage">
              <Database className="h-4 w-4 mr-2" /> Storage
            </TabsTrigger>
            <TabsTrigger value="config">
              <Lock className="h-4 w-4 mr-2" /> Config
            </TabsTrigger>
            <TabsTrigger value="access">
              <ShieldCheck className="h-4 w-4 mr-2" /> Access
            </TabsTrigger>
          </TabsList>

          <ScrollArea className="h-[calc(100vh-320px)]">
            {/* Workloads Tab */}
            <TabsContent value="workloads" className="space-y-4">
              <Card className='bg-gray-50 dark:bg-transparent'>
                <CardHeader>
                  <CardTitle>Create Workload</CardTitle>
                  <CardDescription>
                    Deploy applications to your cluster
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="workload-type">Workload Type</Label>
                    <Select
                      value={workloadType}
                      onValueChange={setWorkloadType}
                    >
                      <SelectTrigger id="workload-type">
                        <SelectValue placeholder="Select workload type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="deployment">Deployment</SelectItem>
                        <SelectItem value="statefulset">StatefulSet</SelectItem>
                        <SelectItem value="daemonset">DaemonSet</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="workload-name">Name</Label>
                      <Input
                        id="workload-name"
                        placeholder="my-app"
                        value={workloadName}
                        onChange={(e) => setWorkloadName(e.target.value)}
                      />
                    </div>

                    {workloadType !== 'daemonset' && (
                      <div className="space-y-2">
                        <Label htmlFor="replicas">Replicas</Label>
                        <Input
                          id="replicas"
                          type="number"
                          min="1"
                          value={replicas}
                          onChange={(e) => setReplicas(parseInt(e.target.value) || 1)}
                        />
                      </div>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="container-image">Container Image</Label>
                    <Input
                      id="container-image"
                      placeholder="nginx:1.21"
                      value={containerImage}
                      onChange={(e) => setContainerImage(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="container-port">Container Port</Label>
                      <Input
                        id="container-port"
                        type="number"
                        value={containerPort}
                        onChange={(e) => setContainerPort(parseInt(e.target.value) || 80)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cpu-requests">CPU Requests</Label>
                      <Input
                        id="cpu-requests"
                        placeholder="100m"
                        value={cpuRequests}
                        onChange={(e) => setCpuRequests(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="memory-requests">Memory Requests</Label>
                      <Input
                        id="memory-requests"
                        placeholder="128Mi"
                        value={memoryRequests}
                        onChange={(e) => setMemoryRequests(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="cpu-limits">CPU Limits</Label>
                      <Input
                        id="cpu-limits"
                        placeholder="200m"
                        value={cpuLimits}
                        onChange={(e) => setCpuLimits(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="memory-limits">Memory Limits</Label>
                      <Input
                        id="memory-limits"
                        placeholder="256Mi"
                        value={memoryLimits}
                        onChange={(e) => setMemoryLimits(e.target.value)}
                      />
                    </div>
                  </div>

                  <Button onClick={generateWorkloadYaml} className="w-full">
                    Generate Workload YAML
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Networking Tab */}
            <TabsContent value="networking" className="space-y-4">
              <Card className='bg-gray-50 dark:bg-transparent'>
                <CardHeader>
                  <CardTitle>Network Configuration</CardTitle>
                  <CardDescription>
                    Create services and ingress resources
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="service-name">Service Name</Label>
                      <Input
                        id="service-name"
                        placeholder="my-service"
                        value={serviceName}
                        onChange={(e) => setServiceName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="service-type">Service Type</Label>
                      <Select
                        value={serviceType}
                        onValueChange={setServiceType}
                      >
                        <SelectTrigger id="service-type">
                          <SelectValue placeholder="Select service type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="ClusterIP">ClusterIP</SelectItem>
                          <SelectItem value="NodePort">NodePort</SelectItem>
                          <SelectItem value="LoadBalancer">LoadBalancer</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="service-port">Service Port</Label>
                      <Input
                        id="service-port"
                        type="number"
                        value={servicePort}
                        onChange={(e) => setServicePort(parseInt(e.target.value) || 80)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="target-port">Target Port</Label>
                      <Input
                        id="target-port"
                        type="number"
                        value={targetPort}
                        onChange={(e) => setTargetPort(parseInt(e.target.value) || 80)}
                      />
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 pt-2">
                    <Checkbox
                      id="create-ingress"
                      checked={createIngress}
                      onCheckedChange={(checked) => setCreateIngress(checked === true)}
                    />
                    <Label htmlFor="create-ingress">Create Ingress</Label>
                  </div>

                  {createIngress && (
                    <div className="space-y-4 pt-2">
                      <div className="space-y-2">
                        <Label htmlFor="ingress-host">Ingress Host</Label>
                        <Input
                          id="ingress-host"
                          placeholder="example.com"
                          value={ingressHost}
                          onChange={(e) => setIngressHost(e.target.value)}
                        />
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="ingress-path">Ingress Path</Label>
                        <Input
                          id="ingress-path"
                          placeholder="/"
                          value={ingressPath}
                          onChange={(e) => setIngressPath(e.target.value)}
                        />
                      </div>
                    </div>
                  )}

                  <Button onClick={generateNetworkingYaml} className="w-full">
                    Generate Networking YAML
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Storage Tab */}
            <TabsContent value="storage" className="space-y-4">
              <Card className='bg-gray-50 dark:bg-transparent'>
                <CardHeader>
                  <CardTitle>Storage Resources</CardTitle>
                  <CardDescription>
                    Create persistent volume claims
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="volume-name">Volume Name</Label>
                    <Input
                      id="volume-name"
                      placeholder="my-data"
                      value={volumeName}
                      onChange={(e) => setVolumeName(e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="volume-size">Volume Size</Label>
                      <Input
                        id="volume-size"
                        placeholder="1Gi"
                        value={volumeSize}
                        onChange={(e) => setVolumeSize(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="storage-class">Storage Class</Label>
                      <Input
                        id="storage-class"
                        placeholder="standard"
                        value={storageClass}
                        onChange={(e) => setStorageClass(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="access-mode">Access Mode</Label>
                    <Select
                      value={accessMode}
                      onValueChange={setAccessMode}
                    >
                      <SelectTrigger id="access-mode">
                        <SelectValue placeholder="Select access mode" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ReadWriteOnce">ReadWriteOnce</SelectItem>
                        <SelectItem value="ReadOnlyMany">ReadOnlyMany</SelectItem>
                        <SelectItem value="ReadWriteMany">ReadWriteMany</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button onClick={generateStorageYaml} className="w-full">
                    Generate Storage YAML
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Config Tab */}
            <TabsContent value="config" className="space-y-4">
              <Card className='bg-gray-50 dark:bg-transparent'>
                <CardHeader>
                  <CardTitle>Configuration</CardTitle>
                  <CardDescription>
                    Create ConfigMaps and Secrets
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="config-type">Configuration Type</Label>
                      <Select
                        value={configType}
                        onValueChange={setConfigType}
                      >
                        <SelectTrigger id="config-type">
                          <SelectValue placeholder="Select type" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="configmap">ConfigMap</SelectItem>
                          <SelectItem value="secret">Secret</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="config-name">Name</Label>
                      <Input
                        id="config-name"
                        placeholder="my-config"
                        value={configName}
                        onChange={(e) => setConfigName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Data Items</Label>
                    {configData.map((item, index) => (
                      <div key={index} className="flex gap-2 mt-2">
                        <Input
                          placeholder="Key"
                          value={item.key}
                          onChange={(e) => updateConfigData(index, 'key', e.target.value)}
                          className="flex-1"
                        />
                        <Input
                          placeholder="Value"
                          value={item.value}
                          onChange={(e) => updateConfigData(index, 'value', e.target.value)}
                          type={configType === 'secret' && item.key.toLowerCase().includes('password') ? 'password' : 'text'}
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() => removeConfigData(index)}
                          disabled={configData.length === 1}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={addConfigData}
                      className="mt-2"
                    >
                      <PlusCircle className="h-4 w-4 mr-2" /> Add Item
                    </Button>
                  </div>

                  <Button onClick={generateConfigYaml} className="w-full mt-4">
                    Generate Config YAML
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Access Control Tab */}
            <TabsContent value="access" className="space-y-4">
              <Card className='bg-gray-50 dark:bg-transparent'>
                <CardHeader>
                  <CardTitle>Access Control</CardTitle>
                  <CardDescription>
                    Create service accounts, roles, and role bindings
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="service-account-name">Service Account Name</Label>
                      <Input
                        id="service-account-name"
                        placeholder="my-service-account"
                        value={serviceAccountName}
                        onChange={(e) => setServiceAccountName(e.target.value)}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="role-name">Role Name</Label>
                      <Input
                        id="role-name"
                        placeholder="my-role"
                        value={roleName}
                        onChange={(e) => setRoleName(e.target.value)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Role Rules</Label>
                    {rules.map((rule, index) => (
                      <Card key={index} className="p-4 mt-2 bg-gray-50 dark:bg-transparent">
                        <div className="space-y-3">
                          <div className="space-y-2">
                            <Label htmlFor={`api-groups-${index}`}>API Groups</Label>
                            <Input
                              id={`api-groups-${index}`}
                              placeholder="apps, batch (comma separated, empty for core)"
                              value={rule.apiGroups.join(', ')}
                              onChange={(e) => {
                                const apiGroups = e.target.value
                                  ? e.target.value.split(',').map(g => g.trim())
                                  : [''];
                                const updatedRules = [...rules];
                                updatedRules[index] = { ...rule, apiGroups };
                                setRules(updatedRules);
                              }}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`resources-${index}`}>Resources</Label>
                            <Input
                              id={`resources-${index}`}
                              placeholder="pods, deployments (comma separated)"
                              value={rule.resources.join(', ')}
                              onChange={(e) => {
                                const resources = e.target.value
                                  .split(',')
                                  .map(r => r.trim());
                                const updatedRules = [...rules];
                                updatedRules[index] = { ...rule, resources };
                                setRules(updatedRules);
                              }}
                            />
                          </div>

                          <div className="space-y-2">
                            <Label htmlFor={`verbs-${index}`}>Verbs</Label>
                            <Input
                              id={`verbs-${index}`}
                              placeholder="get, list, watch (comma separated)"
                              value={rule.verbs.join(', ')}
                              onChange={(e) => {
                                const verbs = e.target.value
                                  .split(',')
                                  .map(v => v.trim());
                                const updatedRules = [...rules];
                                updatedRules[index] = { ...rule, verbs };
                                setRules(updatedRules);
                              }}
                            />
                          </div>

                          <div className="flex justify-end">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                const updatedRules = [...rules];
                                updatedRules.splice(index, 1);
                                setRules(updatedRules);
                              }}
                              disabled={rules.length === 1}
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Remove Rule
                            </Button>
                          </div>
                        </div>
                      </Card>
                    ))}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setRules([
                          ...rules,
                          { apiGroups: [''], resources: ['pods'], verbs: ['get', 'list', 'watch'] }
                        ]);
                      }}
                      className="mt-2"
                    >
                      <PlusCircle className="h-4 w-4 mr-2" /> Add Rule
                    </Button>
                  </div>

                  <Button onClick={generateAccessControlYaml} className="w-full mt-4">
                    Generate Access Control YAML
                  </Button>
                </CardContent>
              </Card>
            </TabsContent>
          </ScrollArea>
        </Tabs>
      </div>
    </div>
  );
};

export default GuiResourceEditor;