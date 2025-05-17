import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Search, ChevronDown, ChevronUp, Check } from 'lucide-react';
import { useNamespace } from '@/contexts/useNamespace';
import { debounce } from 'lodash';
import { Separator } from "@/components/ui/separator";
import { motion, AnimatePresence } from 'framer-motion';

interface NamespacePickerProps {
  isOpen: boolean;
  onClose: () => void;
}

const NamespacePicker: React.FC<NamespacePickerProps> = ({ isOpen, onClose }) => {
  const { availableNamespaces, selectedNamespaces, setSelectedNamespaces } = useNamespace();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [tabPressed, setTabPressed] = useState(false);

  // Debounced search handler
  const debouncedSearch = useCallback(
    debounce((searchQuery: string) => {
      setDebouncedQuery(searchQuery);
    }, 300),
    []
  );

  useEffect(() => {
    debouncedSearch(query);
  }, [query, debouncedSearch]);

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }

    if (!isOpen) {
      setQuery('');
      setActiveIndex(0);
    }
  }, [isOpen]);

  // Handle keyboard navigation and selection
  const handleKeyDown = useCallback((e: KeyboardEvent): void => {
    if (isOpen) {
      const filteredNamespaces = availableNamespaces.filter(ns =>
        ns.toLowerCase().includes(debouncedQuery.toLowerCase())
      );
      
      if (e.code === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.code === 'Enter') {
        e.preventDefault();
        
        if (filteredNamespaces.length > 0) {
          const selected = filteredNamespaces[activeIndex];
          const isSelected = selectedNamespaces.includes(selected);
          
          // Toggle selection
          if (isSelected) {
            setSelectedNamespaces(selectedNamespaces.filter(ns => ns !== selected));
          } else {
            setSelectedNamespaces([...selectedNamespaces, selected]);
          }
          
          // Animation for selection
          setTabPressed(true);
          setTimeout(() => {
            setTabPressed(false);
          }, 300);
        }
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        // Move down 3 items (assuming 3 columns)
        const nextIndex = activeIndex + 3;
        if (nextIndex < filteredNamespaces.length) {
          setActiveIndex(nextIndex);
        }
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        // Move up 3 items (assuming 3 columns)
        const prevIndex = activeIndex - 3;
        if (prevIndex >= 0) {
          setActiveIndex(prevIndex);
        }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        // Move right 1 item
        const nextIndex = activeIndex + 1;
        if (nextIndex < filteredNamespaces.length) {
          setActiveIndex(nextIndex);
        }
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        // Move left 1 item
        const prevIndex = activeIndex - 1;
        if (prevIndex >= 0) {
          setActiveIndex(prevIndex);
        }
      }
    }
  }, [isOpen, availableNamespaces, debouncedQuery, activeIndex, selectedNamespaces, setSelectedNamespaces, onClose]);

  // Set up keyboard event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle changes to the input field
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
    setQuery(e.target.value);
    setActiveIndex(0); // Reset active index when query changes
  };

  // Toggle namespace selection
  const toggleNamespace = (namespace: string) => {
    if (selectedNamespaces.includes(namespace)) {
      setSelectedNamespaces(selectedNamespaces.filter(ns => ns !== namespace));
    } else {
      setSelectedNamespaces([...selectedNamespaces, namespace]);
    }

    // Animation for selection
    setTabPressed(true);
    setTimeout(() => {
      setTabPressed(false);
    }, 300);
  };

  // Filter namespaces based on search query
  const filteredNamespaces = availableNamespaces.filter(ns =>
    ns.toLowerCase().includes(debouncedQuery.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-60">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-xs" onClick={onClose} />
      <AnimatePresence>
        <motion.div
          className="relative w-full max-w-3xl bg-gray-100 dark:bg-[#1B1C26]/80 backdrop-blur-md rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700/30 overflow-hidden"
          initial={{ scale: 0.95, opacity: 0, y: -20 }}
          animate={{
            scale: tabPressed ? [1, 1.02, 1] : 1,
            opacity: 1,
            y: 0,
            boxShadow: tabPressed
              ? ["0px 0px 0px rgba(0, 0, 0, 0)",
                 "0px 0px 30px rgba(59, 130, 246, 0.6)",
                 "0px 0px 15px rgba(59, 130, 246, 0.4)"]
              : "0px 0px 20px rgba(0, 0, 0, 0.2)",
            transition: {
              duration: 0.3,
              damping: 25,
              bounce: 0.4,
              ease: "easeOut",
              boxShadow: {
                delay: 0.05,
                duration: 0.4,
                times: [0, 0.6, 1]
              }
            }
          }}
          exit={{
            scale: 0.95,
            opacity: 0,
            y: -10,
            boxShadow: "0px 0px 0px rgba(0, 0, 0, 0)",
            transition: {
              duration: 0.2
            }
          }}
        >
          {/* Search Input - Using the original design */}
          <div className="flex items-center justify-between py-1 px-4 text-2xl">
            <div className="flex items-center flex-grow relative">
              <div>
                <Search className="w-5 h-5 text-gray-400" />
              </div>

              <motion.div
                className="flex items-center px-1 ml-2"
                initial={false}
                animate={{
                  scale: tabPressed ? [1, 1.1, 1] : 1,
                  transition: {
                    duration: 0.3,
                    ease: "easeOut"
                  }
                }}
              >
                <span className="font-medium text-sm text-white bg-blue-500 px-2 py-1 rounded-[0.3rem]">
                  Namespaces
                </span>
              </motion.div>

              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={handleInputChange}
                placeholder="Search namespaces..."
                className="w-full p-2 text-gray-900 dark:text-gray-100 placeholder-gray-600 bg-transparent border-none focus:outline-none focus:ring-0"
                autoComplete="off"
              />
              
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="p-1 rounded-full hover:bg-gray-300 dark:hover:bg-gray-800/50"
                >
                  <span className="text-gray-500 dark:text-gray-400 text-lg">×</span>
                </button>
              )}
            </div>
          </div>

          {/* Namespaces List - Colorful grid layout */}
          <div className="py-3">
            <div className="px-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm text-gray-500">
                  {selectedNamespaces.length} selected ({availableNamespaces.length} total)
                </p>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setSelectedNamespaces(filteredNamespaces)}
                    className="text-xs px-2 py-1 rounded bg-blue-500 text-white hover:bg-blue-600 transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    onClick={() => setSelectedNamespaces([])}
                    className="text-xs px-2 py-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
                  >
                    Clear All
                  </button>
                </div>
              </div>
              <Separator className="bg-gray-200 dark:bg-gray-900/20 mb-3" />
            </div>
            <div className="px-4 max-h-60 overflow-y-auto">
              <div className="grid grid-cols-3 gap-2 py-2">
                {filteredNamespaces.length > 0 ? (
                  filteredNamespaces.map((namespace, index) => {
                    // Generate deterministic color based on namespace name
                    const colorOptions = [
                      'bg-orange-500',
                      'bg-blue-500',
                      'bg-purple-500',
                      'bg-yellow-500',
                      'bg-green-500',
                      'bg-emerald-500',
                      'bg-teal-500',
                      'bg-red-500',
                      'bg-indigo-500',
                      'bg-[#219ebc]',
                      'bg-[#3e5c76]',
                      'bg-[#006494]',
                      'bg-[#c9184a]',
                      // '',
                    ];
                    const colorIndex = namespace.length % colorOptions.length;
                    const bgColor = colorOptions[colorIndex];
                    const isSelected = selectedNamespaces.includes(namespace);
                    const isActive = index === activeIndex;
                    
                    return (
                      <div
                        key={namespace}
                        onClick={() => toggleNamespace(namespace)}
                        className={`relative rounded-full cursor-pointer transition-all duration-200 ${
                          isActive ? 'ring-2 ring-blue-400 ring-offset-1 dark:ring-offset-gray-800' : ''
                        }`}
                      >
                        <div 
                          className={`flex items-center justify-between rounded-full py-2 px-3 ${
                            isSelected 
                              ? `${bgColor} text-white` 
                              : 'bg-gray-200 dark:bg-gray-800/40 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-700/40'
                          }`}
                        >
                          <span className="text-xs font-medium truncate">{namespace}</span>
                          {isSelected && (
                            <Check className="w-4 h-4 text-white ml-1 flex-shrink-0" />
                          )}
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="col-span-3 text-center py-8 text-gray-500 dark:text-gray-400">
                    No namespaces found
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Escape hint */}
          <div className='bg-gray-200/80 dark:bg-gray-500/10 text-gray-500 dark:text-gray-500 py-2 px-4 text-xs flex flex-wrap justify-end items-center gap-2'>
            <div className="flex items-center">
              <div className="bg-gray-300 dark:bg-gray-700/40 rounded px-1 py-0.5 mr-1 flex items-center">
                <span><ChevronDown className='h-3 w-3' /></span>
              </div>
              <div className="bg-gray-300 dark:bg-gray-700/40 rounded px-1 py-0.5 mr-1 flex items-center">
                <span><ChevronUp className='h-3 w-3' /></span>
              </div>
              <span className=''>navigate rows</span>
            </div>
            
            <div className="flex items-center">
              <div className="bg-gray-300 dark:bg-gray-700/40 rounded px-1 py-0.5 mr-1 flex items-center">
                <span>←</span>
              </div>
              <div className="bg-gray-300 dark:bg-gray-700/40 rounded px-1 py-0.5 mr-1 flex items-center">
                <span>→</span>
              </div>
              <span className=''>navigate columns</span>
            </div>
            
            <div className="flex items-center">
              <div className="bg-gray-300 dark:bg-gray-700/40 rounded px-1.5 py-0.5 mr-1 flex items-center">
                <span>Enter</span>
              </div>
              <span className=''>select</span>
            </div>
            
            <div className="flex items-center">
              <div className="bg-gray-300 dark:bg-gray-700/40 rounded px-1.5 py-0.5 mr-1 flex items-center">
                <span>Esc</span>
              </div>
              <span className=''>close</span>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default NamespacePicker;