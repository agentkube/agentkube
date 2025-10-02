import { useState } from 'react';
import { MiniEditor } from './minieditor.component';

const MiniEditorWrapper = () => {
  const [isMiniEditorOpen, setIsMiniEditorOpen] = useState(false);

  const toggleMiniEditor = () => {
    setIsMiniEditorOpen(!isMiniEditorOpen);
  };

  return (
    <MiniEditor isOpen={isMiniEditorOpen} onToggle={toggleMiniEditor} />
  );
};

export default MiniEditorWrapper;