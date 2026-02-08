// In your component that renders the BackgroundTaskDialog
import { useBackgroundTask } from '@/contexts/useBackgroundTask';
import BackgroundTaskDialog  from './backgroundtaskdialog.component';

const BackgroundTask = () => {
  const { isOpen, resourceName, resourceType, onClose } = useBackgroundTask();

  return (
    <>
      <BackgroundTaskDialog 
        isOpen={isOpen}
        onClose={onClose}
        resourceName={resourceName}
        resourceType={resourceType}
      />
    </>
  );
};

export default BackgroundTask;