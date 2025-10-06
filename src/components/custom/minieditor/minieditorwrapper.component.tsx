import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { MiniEditor } from './minieditor.component';

const MiniEditorWrapper = () => {
  const [isMiniEditorOpen, setIsMiniEditorOpen] = useState(false);
  const location = useLocation();

  const toggleMiniEditor = () => {
    setIsMiniEditorOpen(!isMiniEditorOpen);
  };

  // Don't show mini editor on home page or settings pages
  const shouldHideMiniEditor = location.pathname === '/' || location.pathname.startsWith('/settings');

  if (shouldHideMiniEditor) {
    return null;
  }

  return (
    <MiniEditor isOpen={isMiniEditorOpen} onToggle={toggleMiniEditor} />
  );
};

export default MiniEditorWrapper;