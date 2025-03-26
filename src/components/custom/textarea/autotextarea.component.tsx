import React, { useRef, useState, useEffect, ChangeEvent, FocusEvent, KeyboardEvent } from 'react';

interface MentionItem {
  id: string | number;
  name: string;
  description?: string;
}

interface AutoResizeTextareaProps {
  value: string;
  onChange: (e: ChangeEvent<HTMLTextAreaElement>) => void;
  onFocus?: (e: FocusEvent<HTMLTextAreaElement>) => void;
  onBlur?: (e: FocusEvent<HTMLTextAreaElement>) => void;
  onSubmit?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  autoFocus?: boolean;
  mentionItems?: MentionItem[]; // List of items that can be mentioned
  onMentionSelect?: (item: MentionItem) => void; // Callback when a mention is selected
  width?: string | number; // Explicit width prop
  [key: string]: any; // For other props
}

const AutoResizeTextarea: React.FC<AutoResizeTextareaProps> = ({ 
  value, 
  onChange, 
  onFocus, 
  onBlur, 
  onSubmit,
  placeholder = "", 
  disabled,
  className,
  mentionItems = [],
  onMentionSelect,
  width = "100%", // Default to 100%
  ...props
}) => {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  
  // Convert placeholder to string to prevent [object Object] display
  const placeholderStr = typeof placeholder === 'string' ? placeholder : String(placeholder || "");
  
  // State for mention dropdown
  const [showMentionDropdown, setShowMentionDropdown] = useState(false);
  const [cursorPosition, setCursorPosition] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  
  // Auto-resize function
  const autoResize = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';
    
    // Set the height based on content with a maximum
    const maxHeight = 200;
    if (textarea.scrollHeight > maxHeight) {
      textarea.style.height = `${maxHeight}px`;
      textarea.style.overflowY = 'auto';
    } else {
      textarea.style.height = `${textarea.scrollHeight}px`;
      textarea.style.overflowY = 'hidden';
    }
  };
  
  // Resize on value change
  useEffect(() => {
    autoResize();
  }, [value]);
  
  // Handle input change and detect mentions
  const handleChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const position = e.target.selectionStart || 0;
    
    setCursorPosition(position);
    
    // Check for mention triggers
    const textBeforeCursor = newValue.substring(0, position);
    const mentionMatch = textBeforeCursor.match(/@(\w*)$/);
    
    if (mentionMatch) {
      setShowMentionDropdown(true);
      setSelectedIndex(0);
      setSearchTerm(mentionMatch[1].toLowerCase());
    } else {
      setShowMentionDropdown(false);
    }
    
    // Call the original onChange handler
    onChange(e);
  };
  
  // Handle keydown events for dropdown navigation
  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle dropdown navigation
    if (showMentionDropdown) {
      const filteredItems = getFilteredMentionItems();
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => (prev < filteredItems.length - 1 ? prev + 1 : prev));
          break;
        
        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => (prev > 0 ? prev - 1 : 0));
          break;
        
        case 'Enter':
        case 'Tab':
          if (filteredItems.length > 0) {
            e.preventDefault();
            insertMention(filteredItems[selectedIndex]);
          }
          break;
        
        case 'Escape':
          e.preventDefault();
          setShowMentionDropdown(false);
          break;
          
        default:
          break;
      }
    }
    
    // Handle Enter for submission (original behavior)
    if (e.key === 'Enter' && !e.shiftKey && !showMentionDropdown) {
      e.preventDefault();
      if (value.trim() && onSubmit) {
        onSubmit(e);
      }
    }
  };
  
  // Insert mention at cursor position
  const insertMention = (item: MentionItem) => {
    const textBeforeCursor = value.substring(0, cursorPosition);
    const textAfterCursor = value.substring(cursorPosition);
    
    // Find the position of the @ character before cursor
    const lastAtPos = textBeforeCursor.lastIndexOf('@');
    
    if (lastAtPos !== -1) {
      const newText = 
        textBeforeCursor.substring(0, lastAtPos) + 
        `@${item.name} ` + 
        textAfterCursor;
      
      // Create a synthetic event to trigger the onChange callback
      const syntheticEvent = {
        target: { value: newText }
      } as ChangeEvent<HTMLTextAreaElement>;
      
      onChange(syntheticEvent);
      setShowMentionDropdown(false);
      
      // Set focus back to textarea and place cursor after the inserted mention
      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.focus();
          const newCursorPos = lastAtPos + item.name.length + 2; // +2 for @ and space
          textareaRef.current.setSelectionRange(newCursorPos, newCursorPos);
        }
      }, 0);
      
      // Trigger the onMentionSelect callback if provided
      if (onMentionSelect) {
        onMentionSelect(item);
      }
    }
  };
  
  // Get filtered mention items based on search term
  const getFilteredMentionItems = () => {
    if (!searchTerm) return mentionItems;
    
    return mentionItems.filter(item => 
      item.name.toLowerCase().includes(searchTerm)
    );
  };
  
  // Find all mentions in the text
  const findMentions = (text: string): Array<{start: number, end: number, name: string}> => {
    const mentions = [];
    const regex = /@(\w+)/g;
    let match;
    
    while ((match = regex.exec(text)) !== null) {
      mentions.push({
        start: match.index,
        end: match.index + match[0].length,
        name: match[0]
      });
    }
    
    return mentions;
  };
  
  // Render highlighted mentions
  const renderHighlightedMentions = () => {
    if (!value || findMentions(value).length === 0) {
      return null;
    }
    
    return (
      <div className="mt-2 text-xs text-gray-800 dark:text-gray-400">
        Mentions: {findMentions(value).map((mention, index) => (
          <React.Fragment key={`mention-${index}`}>
            {index > 0 && ', '}
            <span className="text-blue-800 dark:text-blue-300 bg-blue-300/50 dark:bg-blue-500/30 py-0.5 px-1 rounded">
              {mention.name}
            </span>
          </React.Fragment>
        ))}
      </div>
    );
  };
  
  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current && 
        !containerRef.current.contains(event.target as Node)
      ) {
        setShowMentionDropdown(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);
  
  // Focus the textarea initially if needed
  useEffect(() => {
    if (props.autoFocus) {
      textareaRef.current?.focus();
    }
  }, [props.autoFocus]);
  
  return (
    <div 
      ref={containerRef}
      style={{ 
        width: width, 
        position: 'relative', 
        boxSizing: 'border-box'
      }}
    >
      {/* Mention dropdown - positioned above the textarea */}
      {showMentionDropdown && (
        <div 
          ref={dropdownRef}
          style={{
            position: 'absolute',
            bottom: '100%',
            left: 0,
            width: '40%',
            maxHeight: '200px',
            overflow: 'auto',
            zIndex: 20,
            borderRadius: '0.375rem',
            boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
            marginBottom: '5px',
          }}
          className="text-xs bg-white dark:bg-[#0B0D13]/60 backdrop-blur-md dark:border-gray-700
            overflow-y-auto py-1 
            scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50
          "
        >
          <div 
            style={{
              padding: '0.5rem',
            }}
            className="font-bold dark:bg-gray-900 dark:border-gray-600 dark:text-gray-600"
          >
            Functions 
          </div>
          {getFilteredMentionItems().length > 0 ? (
            getFilteredMentionItems().map((item, index) => (
              <div 
                key={item.id} 
                style={{
                  padding: '0.5rem',
                  cursor: 'pointer',
                }}
                className={`backdrop-blur-sm ${selectedIndex === index 
                  ? 'dark:bg-gray-800/30' 
                  : 'hover:bg-gray-400 dark:hover:bg-blue-800/20'}`
                }
                onClick={() => insertMention(item)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div style={{ fontWeight: 500 }} className="dark:text-gray-200">{item.name}</div>
                {item.description && (
                  <div className="text-xs text-gray-500 dark:text-gray-400">{item.description}</div>
                )}
              </div>
            ))
          ) : (
            <div style={{ padding: '0.5rem', color: '#718096' }} className="dark:text-gray-400">
              No matching items
            </div>
          )}
        </div>
      )}

      {/* Regular textarea */}
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onFocus={onFocus}
        onBlur={onBlur}
        onKeyDown={handleKeyDown}
        placeholder={placeholderStr}
        rows={1}
        className={`flex-grow border text-sm border-gray-400 min-h-9 p-2 rounded-[0.4rem] 
                  dark:border-gray-800/50 bg-transparent dark:text-gray-200 
                  focus:outline-none focus:ring-0 focus:border-gray-400 dark:focus:border-transparent
                  resize-none ${className || ''}`}
        style={{ 
          width: '100%',
          height: 'auto',
          maxHeight: '200px',
          boxSizing: 'border-box',
          border: '0px solid transparent',
          padding: '0.5rem',
          fontSize: '0.875rem',
          lineHeight: '1.25rem',
          minHeight: '2.25rem'
        }}
        disabled={disabled}
        {...props}
      />

      {/* Highlighted mentions display */}
      {renderHighlightedMentions()}
    </div>
  );
};

export default AutoResizeTextarea;