import React from 'react';
import { Search, ChevronRight, CircleAlert } from 'lucide-react';
import { Input } from "@/components/ui/input";
import { motion } from 'framer-motion';
import { itemVariants } from '@/utils/styles.utils';
import { ResponseProtocol } from '@/types/response-protocol';
import { FormatDate } from '@/utils/date-formatter.utils';

interface ProtocolViewProps {
  protocols: ResponseProtocol[];
  onProtocolSelect: (protocol: ResponseProtocol) => void;
  onSearch: (searchTerm: string) => void;
  isLoading?: boolean;
}

const ProtocolView: React.FC<ProtocolViewProps> = ({
  protocols,
  onProtocolSelect,
  onSearch,
  isLoading = false
}) => {
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onSearch(e.target.value);
  };

  return (
    <motion.div variants={itemVariants} className="rounded-2xl p-4">
      <div className="relative mb-4">
        <Search className="w-4 h-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
        <Input
          className="pl-9 py-5 rounded-xl border-2 border-gray-500/20"
          placeholder="Search"
          onChange={handleSearchChange}
          disabled={isLoading}
        />
      </div>

      {isLoading ? (
        <ProtocolLoadingSkeleton />
      ) : (
        <motion.div className="grid grid-cols-3 gap-6">
          {protocols.length === 0 ? (
            <div className="col-span-3 flex flex-col items-center justify-center min-h-[200px] text-gray-500">
              <CircleAlert className="w-12 h-12 mb-4 text-gray-400" />
              <p className="text-lg font-medium">No protocols found</p>
              <p className="text-sm mt-2">Try adjusting your search criteria</p>
            </div>
          ) : (
            protocols.map((protocol) => (
              <motion.div
                key={protocol.id}
                className="flex items-center border-2 border-gray-500/20 justify-between p-4 rounded-xl cursor-pointer hover:bg-gray-50"
                whileTap={{ scale: 0.98 }}
                onClick={() => onProtocolSelect(protocol)}
              >
                <div>
                  <div className="flex items-center">
                    <CircleAlert className="w-4 h-4 mr-2 text-gray-500" />
                    <h2 className="text-xl">{protocol.name}</h2>
                  </div>
                  <div className="p-1">
                    <span className="text-sm text-gray-600">{protocol.description}</span>
                  </div>
                  {protocol.createdAt && (
                    <p className="flex justify-end text-sm text-gray-500">
                      {FormatDate(protocol.createdAt)}
                    </p>
                  )}
                </div>
                <ChevronRight className="w-6 h-6" />
              </motion.div>
            ))
          )}
        </motion.div>
      )}
    </motion.div>
  );
};

const ProtocolLoadingSkeleton: React.FC = () => (
  <div className="space-y-1 animate-pulse">
    {[1, 2, 3].map((index) => (
      <div
        key={index}
        className="flex items-center border-2 border-gray-500/20 justify-between p-2 rounded-xl"
      >
        <div className="flex items-center space-x-2">
          <div className="w-4 h-4 rounded-full bg-gray-200" />
          <div className="h-4 w-48 bg-gray-200 rounded" />
        </div>
        <div className="w-4 h-4 rounded bg-gray-200" />
      </div>
    ))}
  </div>
);

export default ProtocolView;