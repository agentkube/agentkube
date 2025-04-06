import { Button } from '@/components/ui/button';
import { Send } from 'lucide-react';
import React, { useState } from 'react';

const Shortcuts = () => {
  const [feedback, setFeedback] = useState('');

  const handleFeedbackSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    // Here you would handle the feedback submission
    console.log('Feedback submitted:', feedback);
    setFeedback('');
  };

  return (
    <div className="p-4 text-gray-800 dark:text-white">
      <h1 className="text-xl font-medium mb-6">Keyboard Shortcuts</h1>

      {/* General Section */}
      <div className="mb-6">
        <h2 className="text-base font-medium mb-3">General</h2>
        <div className="space-y-2">
          <div className="flex">
            <div className="w-24 text-gray-500">
              <span className="text-sm">⌘ K</span>
            </div>
            <div>Kube spotlight</div>
          </div>
          <div className="flex">
            <div className="w-24 text-gray-500">
              <span className="text-sm">⌘ L</span>
            </div>
            <div>Talk to cluster Panel</div>
          </div>
          <div className="flex">
            <div className="w-24 text-gray-500">
              <span className="text-sm">⌘ ←</span>
            </div>
            <div>Navigate Back</div>
          </div>
          <div className="flex">
            <div className="w-24 text-gray-500">
              <span className="text-sm">⌘ →</span>
            </div>
            <div>Navigate Forward</div>
          </div>
          <div className="flex">
            <div className="w-24 text-gray-500">
              <span className="text-sm">⌘ Shift N</span>
            </div>
            <div>New window</div>
          </div>
          <div className="flex">
            <div className="w-24 text-gray-500">
              <span className="text-sm">⌘ Click</span>
            </div>
            <div>Open link in new window</div>
          </div>
        </div>
      </div>

      {/* Zoom Section */}
      <div className="mb-6">
        <h2 className="text-base font-medium mb-3">Zoom</h2>
        <div className="space-y-2">
          <div className="flex">
            <div className="w-24 text-gray-500">
              <span className="text-sm">⌘ 0</span>
            </div>
            <div>Reset Zoom</div>
          </div>
          <div className="flex">
            <div className="w-24 text-gray-500">
              <span className="text-sm">⌘ -</span>
            </div>
            <div>Zoom Out</div>
          </div>
          <div className="flex">
            <div className="w-24 text-gray-500">
              <span className="text-sm">⌘ +</span>
            </div>
            <div>Zoom In</div>
          </div>
        </div>
      </div>

      {/* Resources Section */}
      <div className="mb-10">
        <h2 className="text-base font-medium mb-3">Resources</h2>
        <div className="space-y-2">
          <div className="flex">
            <div className="w-24 text-gray-500">
              <span className="text-sm">⌘ N</span>
            </div>
            <div>Namespace Selector</div>
          </div>
          <div className="flex">
            <div className="w-24 text-gray-500">
              <span className="text-sm">⌘ F</span>
            </div>
            <div>Focus on Filter</div>
          </div>
        </div>
      </div>

      {/* Feedback Section */}
      <div className="mt-8 pb-4">
        <div className="flex items-center text-gray-400">
          <span className="mr-2">✨</span>
          <span className="text-sm">Let us know what shortcuts you'd like see being added.</span>
        </div>
        
        {/* <form onSubmit={handleFeedbackSubmit} className="mt-2">
          <input
            type="text"
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Enter your suggestions here..."
            className="w-full bg-transparent border-b border-gray-700 py-1 text-sm focus:outline-none focus:border-gray-500"
          />
        </form> */}
        <div className='py-2'>
          <Button data-tally-open="n94eZY" data-tally-emoji-text="👋" data-tally-width="500" data-tally-emoji-animation="bounce">
            Request Shortcut <Send />
          </Button>
        </div>
      </div>
    </div>
  );
};

export default Shortcuts;