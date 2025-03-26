import React from 'react';
import { motion } from 'framer-motion';
import { Button } from "@/components/ui/button";
import { itemVariants } from '@/utils/styles.utils';

interface ProtocolHeaderProps {
  onCreateNew: () => void;
  onImport: () => void;
}

const ProtocolHeader: React.FC<ProtocolHeaderProps> = ({
  onCreateNew,
  onImport
}) => {
  return (
    <motion.div 
      variants={itemVariants}
      className="p-4 flex justify-between"
    >
      <div>
        <h1 className="text-4xl font-bold">Response Protocols</h1>
        <p className="text-xl text-gray-600">step-by-step action blueprint.</p>
      </div>
      <div className="flex">
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Button 
            variant="secondary" 
            className="rounded-xl mr-4"
            onClick={onImport}
          >
            Import Response Protocol
          </Button>
        </motion.div>
        <motion.div
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          <Button 
            className="rounded-xl"
            onClick={onCreateNew}
          >
            Create New Response Protocol
          </Button>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default ProtocolHeader;