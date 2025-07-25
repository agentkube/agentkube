
import { Button } from "@/components/ui/button";
import {Brain, Plus } from "lucide-react";

const ContextSetting = () => {
  return (
    <div className="space-y-6">
      <div className='flex items-center space-x-2'>
        <Brain className='text-orange-500' />
        <h1 className='text-2xl font-medium'>Context</h1>
      </div>
      {/* Ignore Files */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
          Ignore Resources
        </h3>
        <div className="bg-gray-200 dark:bg-gray-700/20 rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Configure the list of files that would be ignored by Agentkube when indexing your repository. These ignored resources will be in addition to those specified in your .kubeignore.
          </p>
          <div className="mt-2">
            <Button
              variant="outline"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              Configure ignored Resources
            </Button>
          </div>
        </div>
      </div>

      {/* Add Docs */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
          Add Docs
        </h3>
        <div className="bg-gray-200 dark:bg-gray-700/20 rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Add common docs through URL or local upload as Context for AI Q&A.
          </p>
          <div className="mt-2">
            <Button
              variant="outline"
              size="sm"
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Docs
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContextSetting;