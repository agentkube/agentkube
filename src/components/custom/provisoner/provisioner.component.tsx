import React from 'react';
import { useProvision } from '@/contexts/useProvision';
import { ProvisionDrawer } from '@/components/custom';

const Provisioner = () => {
  const { isOpen, onClose } = useProvision();

  return (
    <>
      <ProvisionDrawer 
        isOpen={isOpen} 
        onClose={onClose} 
      />
    </>
  );
};

export default Provisioner;