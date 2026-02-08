import React, { useRef, useState, useEffect } from 'react';
import { Copy, ThumbsUp, ThumbsDown, Check, Share2 } from 'lucide-react';

interface TaskFeedbackProps {
  taskId: string;
  summary?: string | null;
  remediation?: string | null;
  onFeedbackSubmit?: (feedback: string, isPositive: boolean) => void;
}

const TaskFeedback: React.FC<TaskFeedbackProps> = ({
  taskId,
  summary,
  remediation,
  onFeedbackSubmit
}) => {
  const [copied, setCopied] = useState(false);
  const [liked, setLiked] = useState(false);
  const [disliked, setDisliked] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const feedbackRef = useRef<HTMLDivElement>(null);
  const dislikeButtonRef = useRef<HTMLButtonElement>(null);

  const copyToClipboard = () => {
    const content = `Investigation Summary:\n${summary || 'N/A'}\n\nRemediation:\n${remediation || 'N/A'}`;
    navigator.clipboard.writeText(content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleLike = () => {
    setLiked(!liked);
    if (disliked) setDisliked(false);
    if (onFeedbackSubmit && !liked) {
      onFeedbackSubmit('', true);
    }
  };

  const handleDislike = () => {
    setDisliked(!disliked);
    if (liked) setLiked(false);
    setShowFeedback(!disliked);
  };

  const handleSendFeedback = () => {
    if (onFeedbackSubmit) {
      onFeedbackSubmit(feedbackText, false);
    }
    setShowFeedback(false);
    setFeedbackText('');
  };

  const handleShare = async () => {
    const shareData = {
      title: 'Investigation Report',
      text: `Investigation Summary:\n${summary || 'N/A'}`,
      url: window.location.href
    };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
      } catch (err) {
        // User cancelled or share failed
        console.log('Share cancelled or failed');
      }
    } else {
      // Fallback: copy URL to clipboard
      navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
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
    <div className="flex items-center justify-end space-x-1 relative">
      {showFeedback && (
        <div
          ref={feedbackRef}
          className="absolute top-10 right-0 w-72 bg-card dark:bg-card rounded-lg shadow-lg border dark:border-foreground/10 text-sm z-10"
        >
          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            className="w-full p-2 bg-muted-foreground/10 dark:bg-muted-foreground/10 backdrop-blur-md rounded-t-lg text-gray-800 dark:text-accent text-sm resize-none"
            placeholder="Tell us how we can improve this investigation..."
            rows={3}
          />
          <div className="flex justify-between items-end px-3 pb-2">
            <p className="text-xs text-foreground/60">
              Your feedback helps improve our analysis.
            </p>
            <button
              className="ml-2 px-3 py-1 bg-foreground/10 hover:bg-foreground/20 text-gray-300 rounded text-xs font-medium"
              onClick={handleSendFeedback}
            >
              Send
            </button>
          </div>
        </div>
      )}

      {/* <button
        onClick={copyToClipboard}
        className="p-1.5 rounded-[0.3rem] hover:bg-gray-200 dark:hover:bg-foreground/10 transition-colors"
        title="Copy summary"
      >
        {copied ? (
          <Check className="h-4 w-4 text-green-500" />
        ) : (
          <Copy className="h-4 w-4 text-gray-500 dark:text-muted-foreground/50" />
        )}
      </button>

      <button
        onClick={handleShare}
        className="p-1.5 rounded-[0.3rem] hover:bg-gray-200 dark:hover:bg-foreground/10 transition-colors"
        title="Share"
      >
        <Share2 className="h-4 w-4 text-gray-500 dark:text-muted-foreground/50" />
      </button> */}

      <button
        onClick={handleLike}
        className={`p-1.5 rounded-[0.3rem] hover:bg-gray-200 dark:hover:bg-foreground/10 transition-colors ${liked ? 'text-green-500' : 'text-gray-500 dark:text-muted-foreground/50'
          }`}
        title="Helpful"
      >
        <ThumbsUp className="h-4 w-4" />
      </button>

      <button
        ref={dislikeButtonRef}
        onClick={handleDislike}
        className={`p-1.5 rounded-[0.3rem] hover:bg-gray-200 dark:hover:bg-foreground/10 transition-colors ${disliked ? 'text-red-500' : 'text-gray-500 dark:text-muted-foreground/50'
          }`}
        title="Not helpful"
      >
        <ThumbsDown className="h-4 w-4" />
      </button>
    </div>
  );
};

export default TaskFeedback;
