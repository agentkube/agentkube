import React, { useState, useEffect } from 'react';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle, 
  DialogDescription, 
  DialogFooter 
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AlertCircle, Save, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PROMETHEUS_OPERATOR } from '@/assets';
import { OPENCOST } from '@/assets/providers';

interface ServiceConfig {
  namespace: string;
  service: string;
}

interface ProxyConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (config: ServiceConfig) => void;
  defaultConfig?: ServiceConfig;
  serviceName: string;
  serviceDescription?: string;
  defaultNamespace?: string;
  defaultService?: string;
}

const ProxyConfigDialog: React.FC<ProxyConfigDialogProps> = ({
  isOpen,
  onClose,
  onSave,
  defaultConfig,
  serviceName = "Service",
  serviceDescription,
  defaultNamespace = "default",
  defaultService = "service:8080"
}) => {
  const [namespace, setNamespace] = useState<string>(defaultConfig?.namespace || defaultNamespace);
  const [service, setService] = useState<string>(defaultConfig?.service || defaultService);
  const [error, setError] = useState<string | null>(null);

  // Determine which image to use based on serviceName
  const getServiceImage = () => {
    // Convert serviceName to lowercase and check if it contains specific keywords
    const serviceNameLower = serviceName.toLowerCase();
    
    if (serviceNameLower.includes('prometheus')) {
      return PROMETHEUS_OPERATOR;
    } else if (serviceNameLower.includes('opencost')) {
      return OPENCOST;
    }
    
    // Default case: no image or you could return a default image
    return null;
  };
  
  const serviceImage = getServiceImage();

  useEffect(() => {
    // Reset form when dialog is opened with default values
    if (isOpen) {
      if (defaultConfig) {
        setNamespace(defaultConfig.namespace || defaultNamespace);
        setService(defaultConfig.service || defaultService);
      } else {
        setNamespace(defaultNamespace);
        setService(defaultService);
      }
      setError(null);
    }
  }, [isOpen, defaultConfig, defaultNamespace, defaultService]);

  const handleSave = () => {
    // Basic validation
    if (!namespace.trim()) {
      setError("Namespace cannot be empty");
      return;
    }

    if (!service.trim()) {
      setError("Service cannot be empty");
      return;
    }

    // Clear any previous errors
    setError(null);

    // Save the config
    onSave({
      namespace,
      service
    });

    // Close the dialog
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md bg-white dark:bg-gray-900/20 backdrop-blur-sm">
        <DialogHeader>
          <DialogTitle className="text-xl font-[Anton] uppercase flex items-center space-x-2">
            {serviceImage && <img src={serviceImage} className='h-6 w-6' alt="" />}
            <span>
              {serviceName} Proxy Settings
            </span>
          </DialogTitle>
          <DialogDescription>
            {serviceDescription || `Configure the ${serviceName} service connection details if it's installed in a different namespace or with a custom service name.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {error && (
            <Alert className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800/30">
              <AlertCircle className="h-4 w-4 text-red-600 dark:text-red-400" />
              <AlertDescription className="text-red-600 dark:text-red-400">{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2">
            <Label htmlFor="namespace" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Namespace
            </Label>
            <Input
              id="namespace"
              value={namespace}
              onChange={(e) => setNamespace(e.target.value)}
              placeholder={defaultNamespace}
              className="col-span-3 bg-transparent dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              The Kubernetes namespace where {serviceName} is installed
            </p>
          </div>

          <div className="grid gap-2">
            <Label htmlFor="service" className="text-sm font-medium text-gray-700 dark:text-gray-300">
              Service
            </Label>
            <Input
              id="service"
              value={service}
              onChange={(e) => setService(e.target.value)}
              placeholder={defaultService}
              className="col-span-3 bg-transparent dark:text-white"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              The {serviceName} service name and port (e.g., {defaultService})
            </p>
          </div>
        </div>

        <DialogFooter className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} className="flex items-center">
            <X className="mr-2 h-4 w-4" />
            Cancel
          </Button>
          <Button onClick={handleSave} className="bg-blue-600 hover:bg-blue-700 text-white flex items-center">
            <Save className="mr-2 h-4 w-4" />
            Save Settings
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ProxyConfigDialog;