import React, { useRef, useState, useEffect } from 'react';
import { Copy, ThumbsUp, ThumbsDown, Check, RotateCcw } from 'lucide-react';
import { openExternalUrl } from '@/api/external';

interface ResponseFeedbackProps {
  content: string;
  onFeedbackSubmit?: (feedback: string, isPositive: boolean) => void;
  onRetry?: (userMessage: string) => void;
  userMessage?: string;
}

const ResponseFeedback: React.FC<ResponseFeedbackProps> = ({ 
  content, 
  onFeedbackSubmit,
  onRetry,
  userMessage
}) => {
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const feedbackRef = useRef<HTMLDivElement>(null);
  const dislikeButtonRef = useRef<HTMLButtonElement>(null);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLike = () => {
    setLiked(!liked);
    if (disliked) setDisliked(false);
    // TODO: Add API call to save feedback
    if (onFeedbackSubmit && !liked) {
      onFeedbackSubmit('', true);
    }
  };

  const handleDislike = () => {
    setDisliked(!disliked);
    if (liked) setLiked(false);
    setShowFeedback(!disliked);
    // TODO: Add API call to save feedback
  };

  const handleSendFeedback = () => {
    if (onFeedbackSubmit) {
      onFeedbackSubmit(feedbackText, false);
    }
    setShowFeedback(false);
    setFeedbackText('');
  };

  const handleRetry = () => {
    if (onRetry && userMessage) {
      onRetry(userMessage);
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (feedbackRef.current &&
        !feedbackRef.current.contains(event.target as Node) &&
        dislikeButtonRef.current &&
        !dislikeButtonRef.current.contains(event.target as Node)) {
        setShowFeedback(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="flex items-center justify-end mt-2 space-x-1 relative">
      {showFeedback && (
        <div
          ref={feedbackRef}
          className="absolute bottom-10 right-5 w-72 bg-gray-100 dark:bg-[#0F121B] rounded-lg shadow-lg border dark:border-gray-800 text-sm z-10"
        >
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            className="w-full p-2 bg-gray-300/70 dark:bg-gray-800/40 backdrop-blur-md rounded-t-lg text-gray-800 dark:text-gray-300 text-sm resize-none"
            placeholder="Tell us what you liked about the response or how it could be improved."
            rows={3}
          />
          <div className="flex justify-between items-end px-3 pb-2">
            <p className="text-xs text-gray-500">
              This will share your feedback and all content from the current chat, which Agentkube may use to help improve.{' '}
              <a 
                onClick={() => openExternalUrl("https://agentkube.com")} 
                className="text-blue-400 hover:underline cursor-pointer"
              >
                Learn more
              </a>.
            </p>
            <button
              className="ml-2 px-3 py-1 bg-gray-800 hover:bg-gray-700 text-gray-300 rounded text-xs font-medium"
              onClick={handleSendFeedback}
            >
              Send
            </button>
          </div>
        </div>
      )}

      <button
        onClick={copyToClipboard}
        className="p-1.5 rounded-[0.3rem] hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
        title="Copy message"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4 text-gray-500 dark:text-gray-600" />
        )}
      </button>

      {onRetry && userMessage && (
        <button
          onClick={handleRetry}
          className="p-1.5 rounded-[0.3rem] hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors"
          title="Retry this message"
        >
          <RotateCcw className="h-4 w-4 text-gray-500 dark:text-gray-600" />
        </button>
      )}

      <button
        onClick={handleLike}
        className={`p-1.5 rounded-[0.3rem] hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors ${
          liked ? 'text-green-500' : 'text-gray-500 dark:text-gray-600'
        }`}
        title="Like"
      >
        <ThumbsUp className="h-4 w-4" />
      </button>

      <button
        ref={dislikeButtonRef}
        onClick={handleDislike}
        className={`p-1.5 rounded-[0.3rem] hover:bg-gray-200 dark:hover:bg-gray-800 transition-colors ${
          disliked ? 'text-red-500' : 'text-gray-500 dark:text-gray-600'
        }`}
        title="Dislike"
      >
        <ThumbsDown className="h-4 w-4" />
      </button>
    </div>
  );
};

export default ResponseFeedback;