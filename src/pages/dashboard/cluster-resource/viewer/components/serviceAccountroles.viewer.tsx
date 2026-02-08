import React, { useEffect, useState } from 'react';
import { listResources } from '@/api/internal/resources';
import { Loader2, RefreshCw, AlertCircle, ShieldCheck, Globe, User, ArrowUpRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { useNavigate } from 'react-router-dom';

// Define types for RoleBinding and ClusterRoleBinding
interface RoleRef {
  apiGroup?: string;
  kind: string;
  name: string;
}

interface Subject {
  kind: string;
  name: string;
  namespace?: string;
  apiGroup?: string;
}

interface RoleBinding {
  metadata: {
    name: string;
    namespace: string;
    creationTimestamp: string;
    uid: string;
    [key: string]: any;
  };
  roleRef: RoleRef;
  subjects?: Subject[];
}

interface ClusterRoleBinding {
  metadata: {
    name: string;
    creationTimestamp: string;
    uid: string;
    [key: string]: any;
  };
  roleRef: RoleRef;
  subjects?: Subject[];
}

interface ServiceAccountRolesProps {
  serviceAccountName: string;
  namespace: string;
  clusterName: string;
}

const ServiceAccountRoles: React.FC<ServiceAccountRolesProps> = ({
  serviceAccountName,
  namespace,
  clusterName
}) => {
  const [roleBindings, setRoleBindings] = useState<RoleBinding[]>([]);
  const [clusterRoleBindings, setClusterRoleBindings] = useState<ClusterRoleBinding[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const fetchRoleBindings = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch RoleBindings in the same namespace
      const roleBindingsData = await listResources(
        clusterName,
        'rolebindings',
        { 
          namespace,
          apiGroup: 'rbac.authorization.k8s.io',
          apiVersion: 'v1'
        }
      );

      // Fetch ClusterRoleBindings (cluster-wide)
      const clusterRoleBindingsData = await listResources(
        clusterName,
        'clusterrolebindings',
        { 
          apiGroup: 'rbac.authorization.k8s.io',
          apiVersion: 'v1'
        }
      );

      // Filter RoleBindings that have this ServiceAccount as a subject
      const filteredRoleBindings = roleBindingsData.filter((rb: RoleBinding) => 
        rb.subjects?.some(subject => 
          subject.kind === 'ServiceAccount' && 
          subject.name === serviceAccountName &&
          (!subject.namespace || subject.namespace === namespace)
        )
      );

      // Filter ClusterRoleBindings that have this ServiceAccount as a subject
      const filteredClusterRoleBindings = clusterRoleBindingsData.filter((crb: ClusterRoleBinding) => 
        crb.subjects?.some(subject => 
          subject.kind === 'ServiceAccount' && 
          subject.name === serviceAccountName &&
          (!subject.namespace || subject.namespace === namespace)
        )
      );

      setRoleBindings(filteredRoleBindings);
      setClusterRoleBindings(filteredClusterRoleBindings);
    } catch (err) {
      console.error('Error fetching role bindings:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch role bindings data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRoleBindings();
  }, [serviceAccountName, namespace, clusterName]);

  const handleRefresh = () => {
    fetchRoleBindings();
  };

  // Format date time for display
  const formatDateTime = (timestamp: string | undefined) => {
    if (!timestamp) return 'N/A';
    
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Calculate age from timestamp
  const calculateAge = (timestamp: string | undefined): string => {
    if (!timestamp) return 'N/A';
  
    const created = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
  
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    if (days > 0) return `${days}d`;
  
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    if (hours > 0) return `${hours}h`;
  
    const minutes = Math.floor(diffMs / (1000 * 60));
    return `${minutes}m`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="my-4">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  const hasBindings = roleBindings.length > 0 || clusterRoleBindings.length > 0;

  return (
    <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
      <div className="p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-lg font-medium">Role Bindings</h2>
          <Button variant="outline" size="sm" onClick={handleRefresh}>
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
            Refresh
          </Button>
        </div>

        {/* Role Bindings Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-4 w-4 text-blue-500" />
              <h3 className="text-sm font-medium">RoleBindings</h3>
            </div>
            <div className="text-2xl font-semibold">
              {roleBindings.length}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Namespace-scoped permissions
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900/30 p-4">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="h-4 w-4 text-green-500" />
              <h3 className="text-sm font-medium">ClusterRoleBindings</h3>
            </div>
            <div className="text-2xl font-semibold">
              {clusterRoleBindings.length}
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Cluster-wide permissions
            </div>
          </div>
        </div>

        {!hasBindings && (
          <Alert>
            <AlertDescription>
              No role bindings found for this ServiceAccount. The service account has no RBAC permissions assigned.
            </AlertDescription>
          </Alert>
        )}

        {roleBindings.length > 0 && (
          <div className="mb-6">
            <h3 className="text-md font-medium mb-3">Namespace RoleBindings</h3>
            <div className="rounded-md border">
              <Table className="bg-gray-50 dark:bg-transparent rounded-md">
                <TableHeader>
                  <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roleBindings.map((binding) => (
                    <TableRow
                      key={binding.metadata.uid}
                      className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80"
                    >
                      <TableCell className="font-medium">
                        {binding.metadata.name}
                      </TableCell>
                      <TableCell>
                        {binding.roleRef.name}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                          {binding.roleRef.kind}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span title={formatDateTime(binding.metadata.creationTimestamp)}>
                          {calculateAge(binding.metadata.creationTimestamp)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => navigate(`/dashboard/explore/rolebindings/${namespace}/${binding.metadata.name}`)}
                        >
                          <ArrowUpRight className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}

        {clusterRoleBindings.length > 0 && (
          <div>
            <h3 className="text-md font-medium mb-3">Cluster RoleBindings</h3>
            <div className="rounded-md border">
              <Table className="bg-gray-50 dark:bg-transparent rounded-md">
                <TableHeader>
                  <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Kind</TableHead>
                    <TableHead>Age</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clusterRoleBindings.map((binding) => (
                    <TableRow
                      key={binding.metadata.uid}
                      className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80"
                    >
                      <TableCell className="font-medium">
                        {binding.metadata.name}
                      </TableCell>
                      <TableCell>
                        {binding.roleRef.name}
                      </TableCell>
                      <TableCell>
                        <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
                          {binding.roleRef.kind}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <span title={formatDateTime(binding.metadata.creationTimestamp)}>
                          {calculateAge(binding.metadata.creationTimestamp)}
                        </span>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => navigate(`/dashboard/explore/clusterrolebindings/${binding.metadata.name}`)}
                        >
                          <ArrowUpRight className="h-4 w-4 mr-1" />
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default ServiceAccountRoles;