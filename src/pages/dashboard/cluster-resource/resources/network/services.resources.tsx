import React, { useState, useEffect, useMemo } from 'react';
import { getServices } from '@/api/internal/resources';
import { useCluster } from '@/contexts/clusterContext';
import { useNamespace } from '@/contexts/useNamespace';
import { V1Service } from '@kubernetes/client-node';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, MoreVertical, Search, ArrowUpDown, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useNavigate } from 'react-router-dom';
import { calculateAge } from '@/utils/age';
import { NamespaceSelector, ErrorComponent } from '@/components/custom';
import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { Trash2, Eye } from "lucide-react";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { deleteResource } from '@/api/internal/resources';

// Define sorting types
type SortDirection = 'asc' | 'desc' | null;
type SortField = 'name' | 'namespace' | 'type' | 'clusterIP' | 'externalIP' | 'ports' | 'age' | null;

interface SortState {
  field: SortField;
  direction: SortDirection;
}

const Services: React.FC = () => {
  const navigate = useNavigate();
  const { currentContext } = useCluster();
  const { selectedNamespaces } = useNamespace();
  const [services, setServices] = useState<V1Service[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check for Cmd+F (Mac) or Ctrl+F (Windows)
      if ((e.metaKey || e.ctrlKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault(); 
        
        const searchInput = document.querySelector('input[placeholder*="Search"]') as HTMLInputElement;
        if (searchInput) {
          searchInput.focus();
        }
      }
    };
  
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  // --- Start of Multi-select ---
  const [selectedServices, setSelectedServices] = useState<Set<string>>(new Set());
  const [contextMenuPosition, setContextMenuPosition] = useState<{ x: number, y: number } | null>(null);
  const [showContextMenu, setShowContextMenu] = useState(false);
  const [activeService, setActiveService] = useState<V1Service | null>(null);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Add click handler for Service selection with cmd/ctrl key
  const handleServiceClick = (e: React.MouseEvent, service: V1Service) => {
    if (!service.metadata?.namespace || !service.metadata?.name) return;

    const serviceKey = `${service.metadata.namespace}/${service.metadata.name}`;

    if (e.metaKey || e.ctrlKey) {
      // Prevent navigation when using multi-select
      e.preventDefault();
      e.stopPropagation();

      setSelectedServices(prev => {
        const newSelection = new Set(prev);
        if (newSelection.has(serviceKey)) {
          newSelection.delete(serviceKey);
        } else {
          newSelection.add(serviceKey);
        }
        return newSelection;
      });
    } else if (!selectedServices.has(serviceKey)) {
      // Clear selection on regular click (unless clicking on already selected service)
      setSelectedServices(new Set());
      handleServiceDetails(service);
    } else {
      handleServiceDetails(service);
    }
  };

  // Add context menu handlers
  const handleContextMenu = (e: React.MouseEvent, service: V1Service) => {
    if (!service.metadata?.namespace || !service.metadata?.name) return;

    e.preventDefault();
    e.stopPropagation();

    setContextMenuPosition({ x: e.clientX, y: e.clientY });
    setActiveService(service);
    setShowContextMenu(true);

    // Multi-select support: if service isn't in selection, make it the only selection
    const serviceKey = `${service.metadata.namespace}/${service.metadata.name}`;
    if (!selectedServices.has(serviceKey)) {
      setSelectedServices(new Set([serviceKey]));
    }
  };

  // Close context menu when clicking outside and handle deselection
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      // Close context menu when clicking outside
      if (contextMenuRef.current && !contextMenuRef.current.contains(event.target as Node)) {
        setShowContextMenu(false);
      }

      // Clear selection when clicking outside the table rows
      const target = event.target as Element;

      if (target instanceof Element) {
        const isTableClick = target.closest('table') !== null;
        const isTableHeadClick = target.closest('thead') !== null;
        const isOutsideTable = !isTableClick || isTableHeadClick;
        const isContextMenuClick = contextMenuRef.current?.contains(event.target as Node) || false;
        const isAlertDialogClick = document.querySelector('.dialog-root')?.contains(event.target as Node) || false;

        if (isOutsideTable && !isContextMenuClick && !isAlertDialogClick && selectedServices.size > 0) {
          setSelectedServices(new Set());
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [selectedServices]);

  // Handle view service details
  const handleViewService = () => {
    setShowContextMenu(false);
    if (activeService) {
      handleServiceDetails(activeService);
    }
  };

  // Handle delete action
  const handleDeleteClick = () => {
    setShowContextMenu(false);
    setShowDeleteDialog(true);
  };

  // Perform actual deletion
  const deleteServices = async () => {
    setShowDeleteDialog(false);

    try {
      if (selectedServices.size === 0 && activeService) {
        // Delete single active Service
        await deleteService(activeService);
      } else {
        // Delete all selected Services
        for (const serviceKey of selectedServices) {
          const [namespace, name] = serviceKey.split('/');
          const serviceToDelete = services.find(s =>
            s.metadata?.namespace === namespace && s.metadata?.name === name
          );

          if (serviceToDelete) {
            await deleteService(serviceToDelete);
          }
        }
      }

      // Clear selection after deletion
      setSelectedServices(new Set());

      // Refresh Services list after deletion
      if (currentContext && selectedNamespaces.length > 0) {
        // If no namespaces are selected, fetch from all namespaces
        if (selectedNamespaces.length === 0) {
          const servicesData = await getServices(currentContext.name);
          setServices(servicesData);
          return;
        }

        // Fetch services for each selected namespace
        const servicePromises = selectedNamespaces.map(namespace =>
          getServices(currentContext.name, namespace)
        );

        const results = await Promise.all(servicePromises);

        // Flatten the array of service arrays
        const allServices = results.flat();
        setServices(allServices);
        setError(null);
      }

    } catch (error) {
      console.error('Failed to delete Service(s):', error);
      setError(error instanceof Error ? error.message : 'Failed to delete Service(s)');
    }
  };

  // Delete Service function
  const deleteService = async (service: V1Service) => {
    if (!currentContext || !service.metadata?.name || !service.metadata?.namespace) return;

    await deleteResource(
      currentContext.name,
      'services',
      service.metadata.name,
      { namespace: service.metadata.namespace }
    );
  };

  // Render the context menu
  const renderContextMenu = () => {
    if (!showContextMenu || !contextMenuPosition) return null;

    // Calculate if we need to show the menu above or below the click position
    const windowHeight = window.innerHeight;
    const menuHeight = 120; // Approximate context menu height
    const shouldShowAbove = windowHeight - contextMenuPosition.y < menuHeight;

    return createPortal(
      <div
        ref={contextMenuRef}
        className="fixed z-50 min-w-[180px] bg-white dark:bg-[#0B0D13] backdrop-blur-sm rounded-md shadow-lg border border-gray-300 dark:border-gray-800/60 py-1 text-sm"
        style={{
          left: `${contextMenuPosition.x}px`,
          top: shouldShowAbove
            ? `${contextMenuPosition.y - menuHeight}px`
            : `${contextMenuPosition.y}px`,
        }}
      >
        <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 font-medium border-b border-gray-200 dark:border-gray-800/60">
          {selectedServices.size > 1
            ? `${selectedServices.size} Services selected`
            : activeService?.metadata?.name || 'Service actions'}
        </div>

        {selectedServices.size <= 1 && (
          <div
            className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center"
            onClick={handleViewService}
          >
            <Eye className="h-4 w-4 mr-2" />
            View
          </div>
        )}

        <div
          className="px-3 py-2 hover:bg-gray-100 dark:hover:bg-gray-700 cursor-pointer flex items-center text-red-600 dark:text-red-400"
          onClick={handleDeleteClick}
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete {selectedServices.size > 1 ? `(${selectedServices.size})` : ''}
        </div>
      </div>,
      document.body
    );
  };

  // Delete confirmation dialog
  const renderDeleteDialog = () => {
    return (
      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent className="bg-gray-100 dark:bg-[#0B0D13]">
          <AlertDialogHeader>
            <AlertDialogTitle>Confirm Service Deletion</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete {selectedServices.size > 1
                ? `${selectedServices.size} services`
                : `"${activeService?.metadata?.name}"`}?
              This action cannot be undone.

              <div className="mt-2 text-amber-600 dark:text-amber-400">
                Warning: Deleting a service will remove all associated network configurations.
                {activeService?.spec?.type === 'LoadBalancer' && (
                  <div className="mt-1">
                    This includes LoadBalancer resources that may be provisioned in your cloud environment.
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={deleteServices}
              className="bg-red-600 hover:bg-red-700 dark:bg-red-700 dark:hover:bg-red-800"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  };
  // --- End of Multi-select ---

  // Add sorting state
  const [sort, setSort] = useState<SortState>({
    field: null,
    direction: null
  });

  // Fetch services for all selected namespaces
  useEffect(() => {
    const fetchAllServices = async () => {
      if (!currentContext || selectedNamespaces.length === 0) {
        setServices([]);
        setLoading(false);
        return;
      }

      try {
        setLoading(true);

        // If no namespaces are selected, fetch from all namespaces
        if (selectedNamespaces.length === 0) {
          const servicesData = await getServices(currentContext.name);
          setServices(servicesData);
          return;
        }

        // Fetch services for each selected namespace
        const servicePromises = selectedNamespaces.map(namespace =>
          getServices(currentContext.name, namespace)
        );

        const results = await Promise.all(servicePromises);

        // Flatten the array of service arrays
        const allServices = results.flat();
        setServices(allServices);
        setError(null);
      } catch (err) {
        console.error('Failed to fetch services:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch services');
      } finally {
        setLoading(false);
      }
    };

    fetchAllServices();
  }, [currentContext, selectedNamespaces]);

  // Filter services based on search query
  const filteredServices = useMemo(() => {
    if (!searchQuery.trim()) {
      return services;
    }

    const lowercaseQuery = searchQuery.toLowerCase();

    return services.filter(service => {
      const name = service.metadata?.name?.toLowerCase() || '';
      const namespace = service.metadata?.namespace?.toLowerCase() || '';
      const serviceType = service.spec?.type?.toLowerCase() || '';
      const clusterIP = service.spec?.clusterIP?.toLowerCase() || '';
      const labels = service.metadata?.labels || {};

      // Check if ports contain the query (e.g., searching for "80")
      const portMatches = (service.spec?.ports || []).some(port => {
        const portNumber = port.port?.toString() || '';
        const targetPort = port.targetPort?.toString() || '';
        const nodePort = port.nodePort?.toString() || '';
        const protocol = port.protocol?.toLowerCase() || '';
        const name = port.name?.toLowerCase() || '';

        return (
          portNumber.includes(lowercaseQuery) ||
          targetPort.includes(lowercaseQuery) ||
          nodePort.includes(lowercaseQuery) ||
          protocol.includes(lowercaseQuery) ||
          name.includes(lowercaseQuery)
        );
      });

      // Check if name, namespace, type, or IP contains the query
      if (
        name.includes(lowercaseQuery) ||
        namespace.includes(lowercaseQuery) ||
        serviceType.includes(lowercaseQuery) ||
        clusterIP.includes(lowercaseQuery) ||
        portMatches
      ) {
        return true;
      }

      // Check if any label contains the query
      return Object.entries(labels).some(
        ([key, value]) =>
          key.toLowerCase().includes(lowercaseQuery) ||
          (typeof value === 'string' && value.toLowerCase().includes(lowercaseQuery))
      );
    });
  }, [services, searchQuery]);

  // Sort services based on sort state
  const sortedServices = useMemo(() => {
    if (!sort.field || !sort.direction) {
      return filteredServices;
    }

    return [...filteredServices].sort((a, b) => {
      const sortMultiplier = sort.direction === 'asc' ? 1 : -1;

      switch (sort.field) {
        case 'name':
          return (a.metadata?.name || '').localeCompare(b.metadata?.name || '') * sortMultiplier;

        case 'namespace':
          return (a.metadata?.namespace || '').localeCompare(b.metadata?.namespace || '') * sortMultiplier;

        case 'type': {
          const typeA = a.spec?.type || 'ClusterIP';
          const typeB = b.spec?.type || 'ClusterIP';

          // Define a custom order for service types
          const typeOrder: Record<string, number> = {
            'ClusterIP': 1,
            'NodePort': 2,
            'LoadBalancer': 3,
            'ExternalName': 4
          };

          const orderA = typeOrder[typeA] || 5;
          const orderB = typeOrder[typeB] || 5;

          return (orderA - orderB) * sortMultiplier;
        }

        case 'clusterIP': {
          const ipA = a.spec?.clusterIP || '';
          const ipB = b.spec?.clusterIP || '';

          // Special handling for "None" (headless services)
          if (ipA === 'None' && ipB !== 'None') return 1 * sortMultiplier;
          if (ipA !== 'None' && ipB === 'None') return -1 * sortMultiplier;
          if (ipA === 'None' && ipB === 'None') return 0;

          // IP address sorting (split by dots and compare segments as numbers)
          const ipPartsA = ipA.split('.').map(part => parseInt(part, 10) || 0);
          const ipPartsB = ipB.split('.').map(part => parseInt(part, 10) || 0);

          for (let i = 0; i < 4; i++) {
            const partA = ipPartsA[i] || 0;
            const partB = ipPartsB[i] || 0;

            if (partA !== partB) {
              return (partA - partB) * sortMultiplier;
            }
          }

          return 0;
        }

        case 'externalIP': {
          const externalIpsA = a.status?.loadBalancer?.ingress || [];
          const externalIpsB = b.status?.loadBalancer?.ingress || [];

          // Sort by number of external IPs first
          if (externalIpsA.length !== externalIpsB.length) {
            return (externalIpsA.length - externalIpsB.length) * sortMultiplier;
          }

          // If both have an external IP, compare the first one
          if (externalIpsA.length > 0 && externalIpsB.length > 0) {
            const ipA = externalIpsA[0].ip || externalIpsA[0].hostname || '';
            const ipB = externalIpsB[0].ip || externalIpsB[0].hostname || '';
            return ipA.localeCompare(ipB) * sortMultiplier;
          }

          return 0;
        }

        case 'ports': {
          const portsA = a.spec?.ports || [];
          const portsB = b.spec?.ports || [];

          // Sort by number of ports first
          if (portsA.length !== portsB.length) {
            return (portsA.length - portsB.length) * sortMultiplier;
          }

          // If they have the same number of ports, compare the first port
          if (portsA.length > 0 && portsB.length > 0) {
            const portA = portsA[0].port || 0;
            const portB = portsB[0].port || 0;
            return (portA - portB) * sortMultiplier;
          }

          return 0;
        }

        case 'age': {
          const timeA = a.metadata?.creationTimestamp ? new Date(a.metadata.creationTimestamp).getTime() : 0;
          const timeB = b.metadata?.creationTimestamp ? new Date(b.metadata.creationTimestamp).getTime() : 0;
          return (timeA - timeB) * sortMultiplier;
        }

        default:
          return 0;
      }
    });
  }, [filteredServices, sort.field, sort.direction]);

  const handleServiceDetails = (service: V1Service) => {
    if (service.metadata?.name && service.metadata?.namespace) {
      navigate(`/dashboard/explore/services/${service.metadata.namespace}/${service.metadata.name}`);
    }
  };

  // Format service ports for display
  const formatServicePorts = (service: V1Service): string => {
    const ports = service.spec?.ports || [];
    if (ports.length === 0) return '-';

    return ports.map(port => {
      let portStr = `${port.port}`;
      if (port.name) {
        portStr = `${port.name}:${portStr}`;
      }
      if (port.nodePort) {
        portStr += `:${port.nodePort}`;
      }
      if (port.protocol && port.protocol !== 'TCP') {
        portStr += `/${port.protocol}`;
      }
      return portStr;
    }).join(', ');
  };

  // Get external IP/Hostname for a LoadBalancer service
  const getExternalIP = (service: V1Service): string => {
    // For ExternalName type, return the external name
    if (service.spec?.type === 'ExternalName') {
      return service.spec.externalName || '-';
    }

    // For LoadBalancer type, check status
    if (service.spec?.type === 'LoadBalancer') {
      const ingress = service.status?.loadBalancer?.ingress || [];
      if (ingress.length > 0) {
        // Use IP or hostname, whichever is available
        return ingress.map(i => i.ip || i.hostname).filter(Boolean).join(', ');
      }
      return '<pending>';
    }

    // For NodePort, we could show node IPs, but that would require fetching nodes
    if (service.spec?.type === 'NodePort') {
      return '<NodePort>';
    }

    // For ClusterIP, there's no external IP
    return '-';
  };

  // Get a color class based on the service type
  const getServiceTypeColorClass = (type: string | undefined): string => {
    if (!type) return 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300';

    switch (type) {
      case 'ClusterIP':
        return 'bg-blue-200 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400';
      case 'NodePort':
        return 'bg-green-200 text-green-800 dark:bg-green-900/30 dark:text-green-400';
      case 'LoadBalancer':
        return 'bg-purple-200 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400';
      case 'ExternalName':
        return 'bg-yellow-200 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400';
      default:
        return 'bg-gray-200 text-gray-700 dark:bg-gray-800 dark:text-gray-300';
    }
  };

  // Handle column sort click
  const handleSort = (field: SortField) => {
    setSort(prevSort => {
      // If clicking the same field
      if (prevSort.field === field) {
        // Toggle direction: asc -> desc -> null -> asc
        if (prevSort.direction === 'asc') {
          return { field, direction: 'desc' };
        } else if (prevSort.direction === 'desc') {
          return { field: null, direction: null };
        } else {
          return { field, direction: 'asc' };
        }
      }
      // If clicking a new field, default to ascending
      return { field, direction: 'asc' };
    });
  };

  // Render sort indicator
  const renderSortIndicator = (field: SortField) => {
    if (sort.field !== field) {
      return <ArrowUpDown className="ml-1 h-4 w-4 inline opacity-10" />;
    }

    if (sort.direction === 'asc') {
      return <ArrowUp className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    if (sort.direction === 'desc') {
      return <ArrowDown className="ml-1 h-4 w-4 inline text-blue-500" />;
    }

    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <ErrorComponent message={error} />
    );
  }

  return (
    <div className="p-6 space-y-6
        max-h-[92vh] overflow-y-auto
          scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
          [&::-webkit-scrollbar]:w-1.5 
          [&::-webkit-scrollbar-track]:bg-transparent 
          [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
          [&::-webkit-scrollbar-thumb]:rounded-full
          [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div className='flex items-center justify-between md:flex-row gap-4 md:items-end'>
        <div>
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>Services</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, namespace, type, or port..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="w-full md:w-96">
          <div className="text-sm font-medium mb-2">Namespaces</div>
          <NamespaceSelector />
        </div>
      </div>

      {/* No results message */}
      {sortedServices.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No services matching "${searchQuery}"`
              : selectedNamespaces.length === 0
                ? "Please select at least one namespace"
                : "No services found in the selected namespaces"}
          </AlertDescription>
        </Alert>
      )}

      {/* Services table */}
      {sortedServices.length > 0 && (
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <div className="rounded-md border">
            {renderContextMenu()}
            {renderDeleteDialog()}
            <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
              <TableHeader>
                <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('name')}
                  >
                    Name {renderSortIndicator('name')}
                  </TableHead>
                  <TableHead
                    className="cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('namespace')}
                  >
                    Namespace {renderSortIndicator('namespace')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('type')}
                  >
                    Type {renderSortIndicator('type')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('clusterIP')}
                  >
                    Cluster IP {renderSortIndicator('clusterIP')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('externalIP')}
                  >
                    External IP {renderSortIndicator('externalIP')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('ports')}
                  >
                    Ports {renderSortIndicator('ports')}
                  </TableHead>
                  <TableHead
                    className="text-center cursor-pointer hover:text-blue-500"
                    onClick={() => handleSort('age')}
                  >
                    Age {renderSortIndicator('age')}
                  </TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedServices.map((service) => (
                  <TableRow
                    key={`${service.metadata?.namespace}-${service.metadata?.name}`}
                    className={`bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30 ${service.metadata?.namespace && service.metadata?.name &&
                        selectedServices.has(`${service.metadata.namespace}/${service.metadata.name}`)
                        ? 'bg-blue-50 dark:bg-gray-800/30'
                        : ''
                      }`}
                    onClick={(e) => handleServiceClick(e, service)}
                    onContextMenu={(e) => handleContextMenu(e, service)}
                  >
                    <TableCell className="font-medium" onClick={() => handleServiceDetails(service)}>
                      <div className="hover:text-blue-500 hover:underline">
                        {service.metadata?.name}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="hover:text-blue-500 hover:underline" onClick={() => navigate(`/dashboard/explore/namespaces`)}>
                        {service.metadata?.namespace}
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      <span className={`px-2 py-1 rounded-[0.3rem] text-xs font-medium ${getServiceTypeColorClass(service.spec?.type)}`}>
                        {service.spec?.type || 'ClusterIP'}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      {service.spec?.clusterIP || '-'}
                    </TableCell>
                    <TableCell className="text-center">
                      {getExternalIP(service)}
                    </TableCell>
                    <TableCell className="text-center">
                      {formatServicePorts(service)}
                    </TableCell>
                    <TableCell className="text-center">
                      {calculateAge(service.metadata?.creationTimestamp?.toString())}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          // Implement actions menu if needed
                        }}
                      >
                        <MoreVertical className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default Services;