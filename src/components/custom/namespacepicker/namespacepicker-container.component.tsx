import React from 'react';
import { useNamespace } from '@/contexts/useNamespace';
import NamespacePicker from './namespacepicker.component';

const NamespacePickerContainer: React.FC = () => {
  const { isNamespacePickerOpen, closeNamespacePicker } = useNamespace();
  
  return (
    <>
      {/* Render the NamespacePicker when open */}
      <NamespacePicker 
        isOpen={isNamespacePickerOpen} 
        onClose={closeNamespacePicker} 
      />
    </>
  );
};

export default NamespacePickerContainer;