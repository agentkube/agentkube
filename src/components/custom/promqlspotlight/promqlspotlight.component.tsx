import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Database } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { usePromQL } from '@/contexts/usePromQL';
import { PROMETHEUS } from '@/assets';

const PromQLSpotlight: React.FC = () => {
  const { isOpen, query, setQuery, onClose } = usePromQL();
  const inputRef = useRef<HTMLInputElement>(null);
  const [enterPressed, setEnterPressed] = useState(false);
  const [tabPressed, setTabPressed] = useState(false);
  const [promqlMode, setPromqlMode] = useState(false);
  const [promqlQuery, setPromqlQuery] = useState('');

  useEffect(() => {
    if (isOpen && inputRef.current) {
      inputRef.current.focus();
    }

    if (!isOpen) {
      // Clean up when closing
      setPromqlMode(false);
      setPromqlQuery('');
    }
  }, [isOpen]);

  // Handle keyboard navigation and selection
  const handleKeyDown = useCallback((e: KeyboardEvent): void => {
    if (isOpen) {
      if (promqlMode) {
        if (e.code === 'Enter') {
          e.preventDefault();
          // Handle PromQL query execution here
          console.log('Execute PromQL query:', promqlQuery);

          // Animation for enter press
          setEnterPressed(true);
          setTimeout(() => {
            setEnterPressed(false);
          }, 300);
        } else if (e.code === 'Backspace' && promqlQuery === '') {
          // If backspace is pressed when the promql query is empty, exit promql mode
          e.preventDefault();
          setPromqlMode(false);
          setPromqlQuery('');
          setQuery('');
        }
      } else {
        // Normal mode - check for Tab to enter PromQL mode
        if (e.code === 'Tab') {
          e.preventDefault();
          // Enter PromQL mode
          setPromqlMode(true);
          setPromqlQuery('');

          // Animation for tab press
          setTabPressed(true);
          setTimeout(() => {
            setTabPressed(false);
          }, 300);
        }
      }
    }
  }, [isOpen, promqlMode, promqlQuery, setQuery]);

  // Set up keyboard event listeners
  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  // Handle input changes
  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (promqlMode) {
      setPromqlQuery(e.target.value);
    } else {
      setQuery(e.target.value);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-60">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-xs" onClick={onClose} />
      <AnimatePresence>
        <motion.div
          className="relative w-full max-w-3xl bg-gray-100 dark:bg-[#1B1C26]/70 backdrop-blur-md rounded-xl shadow-2xl border border-gray-200 dark:border-gray-700/30 overflow-hidden"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{
            scale: tabPressed || enterPressed ? [1, 1.03, 1] : 1,
            opacity: 1,
            boxShadow: tabPressed || enterPressed
              ? ["0px 0px 0px rgba(0, 0, 0, 0)",
                "0px 0px 30px rgba(236, 72, 72, 0.6)",
                "0px 0px 15px rgba(236, 72, 72, 0.78)"]
              : "0px 0px 0px rgba(0, 0, 0, 0)",
            transition: {
              duration: 0.3,
              damping: 25,
              bounce: 0.5,
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
            boxShadow: "0px 0px 0px rgba(0, 0, 0, 0)",
            transition: {
              duration: 0.2
            }
          }}
        >
          {/* Search Input */}
          <div className="flex items-center justify-between py-1 px-4 text-2xl">
            <div className="flex items-center flex-grow relative">
              <div>
                <img src={PROMETHEUS} className='w-7 h-6 ' alt="" />
              </div>

              {/* PromQL Badge - only show in PromQL mode */}
              {promqlMode && (
                <motion.div
                  className="flex items-center px-1 ml-2"
                  initial={false}
                  animate={{
                    scale: tabPressed || enterPressed ? [1, 1.1, 1] : 1,
                    transition: {
                      duration: 0.3,
                      ease: "easeOut"
                    }
                  }}
                >
                  <span className="font-medium text-sm text-white bg-[#de4940] px-2 py-1 rounded-[0.3rem]">
                    PromQL
                  </span>
                </motion.div>
              )}

              <input
                ref={inputRef}
                type="text"
                value={promqlMode ? promqlQuery : query}
                onChange={handleInputChange}
                placeholder={
                  promqlMode
                    ? "Enter PromQL query..."
                    : "Search for Prometheus queries..."
                }
                className={`w-full p-2 text-gray-900 dark:text-gray-100 placeholder-gray-600 bg-transparent border-none focus:outline-none focus:ring-0 ${promqlMode ? 'font-mono' : ''
                  }`}
                autoComplete="off"
              />

              {/* Query hint */}
              <div className="absolute right-0 text-gray-600 dark:text-gray-400 text-sm flex items-center">
                {!promqlMode ? (
                  <>
                    <span>PromQL mode</span>
                    <div className="bg-gray-200 dark:bg-gray-700/40 rounded px-1.5 py-0.5 ml-2 flex items-center">
                      <span>Tab</span>
                    </div>
                  </>
                ) : (
                  <>
                    <span>Execute query</span>
                    <div className="bg-gray-200 dark:bg-gray-700/40 rounded px-1.5 py-0.5 ml-2 flex items-center">
                      <span>Enter</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Query results will be displayed here */}
          {promqlMode && (
            <div className="px-4">
              <div className="text-xs text-gray-500 dark:text-gray-400 border-t border-gray-200 dark:border-gray-700/30 py-2">
                {promqlQuery ? (
                  <span>Ready to execute: <code className="font-mono bg-gray-200 dark:bg-gray-800/50 px-1 rounded">{promqlQuery}</code></span>
                ) : (
                  <span>Type a PromQL query and press Enter to execute</span>
                )}
              </div>
            </div>
          )}

          {/* Escape hint */}
          <div className='bg-gray-200/80 dark:bg-gray-500/10 text-gray-500 dark:text-gray-500 py-1 px-4 text-xs flex justify-end items-center'>
            {promqlMode ? (
              <>
                <div className="bg-gray-300 dark:bg-gray-700/40 rounded px-1.5 py-0.5 mr-1 flex items-center">
                  <span>Enter</span>
                </div>
                <span className='mr-4'>execute</span>
                <div className="bg-gray-300 dark:bg-gray-700/40 rounded px-1.5 py-0.5 mr-1 flex items-center">
                  <span>Backspace</span>
                </div>
                <span className='mr-4'>exit PromQL mode</span>
              </>
            ) : (
              <>
                <div className="bg-gray-300 dark:bg-gray-700/40 rounded px-1.5 py-0.5 mr-1 flex items-center">
                  <span>Tab</span>
                </div>
                <span className='mr-4'>PromQL mode</span>
              </>
            )}
            <div className="bg-gray-300 dark:bg-gray-700/40 rounded px-1.5 py-0.5 mr-1 flex items-center">
              <span>Esc</span>
            </div>
            <span className=''>
              close
            </span>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
};

export default PromQLSpotlight;