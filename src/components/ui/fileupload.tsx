"use client";

import { useState, useRef, DragEvent, ChangeEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import clsx from "clsx";
import {
  UploadCloud,
  File as FileIcon,
  Trash2,
  Loader,
  CheckCircle,
  FileText,
  Plus,
} from "lucide-react";

// Add File type import
declare const File: {
  new (parts: (string | Blob | ArrayBuffer | ArrayBufferView)[], filename: string, options?: FilePropertyBag): File;
};

interface FileWithPreview {
  id: string;
  preview: string;
  progress: number;
  name: string;
  size: number;
  type: string;
  lastModified?: number;
  file?: File;
  isFromText?: boolean;
}

type UploadMode = 'files' | 'text';

interface FileUploadProps {
  onFilesUploaded?: (files: FileWithPreview[]) => void;
}


export default function FileUpload({ onFilesUploaded }: FileUploadProps) {
  const [files, setFiles] = useState<FileWithPreview[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadMode, setUploadMode] = useState<UploadMode>('files');
  const [yamlContent, setYamlContent] = useState('');
  const [fileName, setFileName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Process dropped or selected files
  const handleFiles = (fileList: FileList) => {
    const newFiles = Array.from(fileList).map((file) => ({
      id: `${URL.createObjectURL(file)}-${Date.now()}`,
      preview: URL.createObjectURL(file),
      progress: 0,
      name: file.name,
      size: file.size,
      type: file.type,
      lastModified: file.lastModified,
      file,
      isFromText: false,
    }));
    setFiles((prev) => [...prev, ...newFiles]);
    newFiles.forEach((f) => simulateUpload(f.id));
  };

  // Process pasted YAML content
  const handleYamlContent = () => {
    if (!yamlContent.trim()) return;

    const name = fileName.trim() || `kubeconfig-${Date.now()}.yaml`;
    const content = yamlContent.trim();
    const blob = new Blob([content], { type: 'application/x-yaml' });
    const size = blob.size;

    // Create a File object from the text content
    const file = new File([content], name, { type: 'application/x-yaml' });

    const newFile: FileWithPreview = {
      id: `text-${Date.now()}`,
      preview: '',
      progress: 0,
      name,
      size,
      type: 'application/x-yaml',
      lastModified: Date.now(),
      file,
      isFromText: true,
    };

    setFiles((prev) => [...prev, newFile]);
    simulateUpload(newFile.id);

    // Clear the form
    setYamlContent('');
    setFileName('');
    setUploadMode('files');
  };

  // Simulate upload progress
  const simulateUpload = (id: string) => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += Math.random() * 15;
      setFiles((prev) => {
        const updated = prev.map((f) =>
          f.id === id ? { ...f, progress: Math.min(progress, 100) } : f
        );
        
        // Call callback when upload completes
        if (progress >= 100 && onFilesUploaded) {
          const completedFile = updated.find(f => f.id === id);
          if (completedFile) {
            setTimeout(() => onFilesUploaded(updated), 100);
          }
        }
        
        return updated;
      });
  
      if (progress >= 100) {
        clearInterval(interval);
        if (navigator.vibrate) navigator.vibrate(100);
      }
    }, 300);
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  };

  const onDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const onDragLeave = () => setIsDragging(false);

  const onSelect = (e: ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) handleFiles(e.target.files);
  };

  const formatFileSize = (bytes: number): string => {
    if (!bytes) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
  };

  return (
    <div className="w-full max-w-3xl mx-auto p-4 md:p-6">
      {/* Mode Toggle */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setUploadMode('files')}
          className={clsx(
            "flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all duration-200",
            uploadMode === 'files'
              ? "bg-white text-black shadow-md"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          )}
        >
          <UploadCloud className="w-4 h-4" />
          Upload Files
        </button>
        <button
          onClick={() => setUploadMode('text')}
          className={clsx(
            "flex items-center gap-2 px-4 py-2 rounded-md font-medium transition-all duration-200",
            uploadMode === 'text'
              ? "bg-white text-black shadow-md"
              : "bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200 dark:hover:bg-zinc-700"
          )}
        >
          <FileText className="w-4 h-4" />
          Paste YAML
        </button>
      </div>

      {/* File Upload Mode */}
      {uploadMode === 'files' && (
        <motion.div
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          initial={false}
          animate={{
            borderColor: isDragging ? "#3b82f6" : "#ffffff10",
            scale: isDragging ? 1.02 : 1,
          }}
          whileHover={{ scale: 1.01 }}
          transition={{ duration: 0.2 }}
          className={clsx(
            "relative rounded-4xl p-8 md:p-12 text-center cursor-pointer bg-background border border-primary/10 shadow-2xl/10 backdrop-blur group",
            isDragging && "ring-4 ring-blue-400/30 border-blue-500"
          )}
        >
          <div className="flex flex-col items-center gap-5">
            <motion.div
              animate={{ y: isDragging ? [-5, 0, -5] : 0 }}
              transition={{
                duration: 1.5,
                repeat: isDragging ? Infinity : 0,
                ease: "easeInOut",
              }}
              className="relative"
            >
              <motion.div
                animate={{
                  opacity: isDragging ? [0.5, 1, 0.5] : 1,
                  scale: isDragging ? [0.95, 1.05, 0.95] : 1,
                }}
                transition={{
                  duration: 2,
                  repeat: isDragging ? Infinity : 0,
                  ease: "easeInOut",
                }}
                className="absolute -inset-4 bg-blue-400/10 rounded-full blur-md"
                style={{ display: isDragging ? "block" : "none" }}
              />
              <UploadCloud
                className={clsx(
                  "w-16 h-16 md:w-20 md:h-10 drop-shadow-sm",
                  isDragging
                    ? "text-blue-500"
                    : "text-zinc-700 dark:text-zinc-300 group-hover:text-blue-500 transition-colors duration-300"
                )}
              />
            </motion.div>

            <div className="space-y-2">
              <h3 className="text-xl md:text-2xl font-semibold text-zinc-800 dark:text-zinc-100">
                {isDragging
                  ? "Drop files here"
                  : files.length
                  ? "Add more files"
                  : "Upload kubeconfig files"}
              </h3>
              <p className="text-zinc-600 dark:text-zinc-300 md:text-lg max-w-md mx-auto">
                {isDragging ? (
                  <span className="font-medium text-blue-500">
                    Release to upload
                  </span>
                ) : (
                  <>
                    Drag & drop files here, or{" "}
                    <span className="text-blue-500 font-medium">browse</span>
                  </>
                )}
              </p>
              <p className="text-sm text-zinc-500 dark:text-zinc-400">
                Supports .yaml, .yml and .json
              </p>
            </div>

            <input
              ref={inputRef}
              type="file"
              multiple
              hidden
              onChange={onSelect}
              accept=".yaml,.yml,.json,application/json,application/x-yaml,text/yaml"
            />
          </div>
        </motion.div>
      )}

      {/* YAML Text Input Mode */}
      {uploadMode === 'text' && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="space-y-4"
        >
          <div className="rounded-2xl bg-background shadow-2xl/10 backdrop-blur">
            {/* File Name Input */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                File Name (optional)
              </label>
              <input
                type="text"
                value={fileName}
                onChange={(e) => setFileName(e.target.value)}
                placeholder="kubeconfig.yaml"
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 dark:placeholder-zinc-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors"
              />
            </div>

            {/* YAML Content Textarea */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2">
                YAML Content
              </label>
              <textarea
                value={yamlContent}
                onChange={(e) => setYamlContent(e.target.value)}
                placeholder={`apiVersion: v1
kind: Config
clusters:
- cluster:
    certificate-authority-data: ...
    server: https://...
  name: my-cluster
contexts:
- context:
    cluster: my-cluster
    user: my-user
  name: my-context
current-context: my-context
users:
- name: my-user
  user:
    token: ...`}
                rows={12}
                className="w-full px-3 py-2 border border-zinc-300 dark:border-zinc-600 rounded-lg bg-white dark:bg-transparent text-zinc-900 dark:text-zinc-100 placeholder-zinc-500 dark:placeholder-zinc-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-colors font-mono text-sm resize-y min-h-[200px]"
              />
            </div>

            {/* Add Button */}
            <button
              onClick={handleYamlContent}
              disabled={!yamlContent.trim()}
              className={clsx(
                "flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all duration-200",
                yamlContent.trim()
                  ? "bg-white hover:bg-blue-600 text-black shadow-md hover:shadow-lg"
                  : "bg-zinc-200 dark:bg-zinc-700 text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
              )}
            >
              <Plus className="w-4 h-4" />
              Add YAML Content
            </button>
          </div>
        </motion.div>
      )}

      {/* Uploaded files list */}
      <div className="mt-4">
        <AnimatePresence>
          {files.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex justify-between items-center mb-2 px-2"
            >
              <h3 className="font-semibold text-md text-zinc-800 dark:text-zinc-200">
                Uploaded files ({files.length})
              </h3>
              {files.length > 1 && (
                <button
                  onClick={() => setFiles([])}
                  className="text-sm font-medium px-3 py-1 bg-zinc-100 hover:bg-zinc-200 dark:bg-zinc-700 dark:hover:bg-zinc-600 rounded-md text-zinc-700 hover:text-red-600 dark:text-zinc-300 dark:hover:text-red-400 transition-colors duration-200"
                >
                  Clear all
                </button>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <div
          className={clsx(
            "flex flex-col gap-3 overflow-y-auto pr-2",
            files.length > 3 &&
              "max-h-96 scrollbar-thin scrollbar-thumb-zinc-300 dark:scrollbar-thumb-zinc-600 scrollbar-track-transparent"
          )}
        >
          <AnimatePresence>
            {files.map((file) => (
              <motion.div
                key={file.id}
                initial={{ opacity: 0, y: 20, scale: 0.97 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 24 }}
                className="px-4 py-4 flex items-start gap-4 rounded-xl bg-zinc-50 dark:bg-zinc-800/80 shadow hover:shadow-md transition-all duration-200"
              >
                {/* File icon */}
                <div className="relative flex-shrink-0">
                  <div className={clsx(
                    "w-10 h-10 md:w-16 md:h-16 rounded-lg border dark:border-zinc-700 shadow-sm flex items-center justify-center",
                    file.isFromText 
                      ? "bg-green-50 dark:bg-green-900/20" 
                      : "bg-blue-50 dark:bg-blue-900/20"
                  )}>
                    {file.isFromText ? (
                      <FileText className="w-6 h-6 text-green-500 dark:text-green-400" />
                    ) : (
                      <FileIcon className="w-6 h-6 text-blue-500 dark:text-blue-400" />
                    )}
                  </div>
                  {file.progress === 100 && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.5 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="absolute -right-2 -bottom-2 bg-white dark:bg-zinc-800 rounded-full shadow-sm"
                    >
                      <CheckCircle className="w-5 h-5 text-emerald-500" />
                    </motion.div>
                  )}
                </div>

                {/* File info & progress */}
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col gap-1 w-full">
                    {/* Filename */}
                    <div className="flex items-center gap-2 min-w-0">
                      {file.isFromText ? (
                        <FileText className="w-4 h-4 flex-shrink-0 text-green-500 dark:text-green-400" />
                      ) : (
                        <FileIcon className="w-4 h-4 flex-shrink-0 text-blue-500 dark:text-blue-400" />
                      )}
                      <h4
                        className="font-medium text-sm truncate text-zinc-800 dark:text-zinc-200"
                        title={file.name}
                      >
                        {file.name}
                      </h4>
                      {file.isFromText && (
                        <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 px-2 py-1 rounded-full">
                          From text
                        </span>
                      )}
                    </div>

                    {/* Details & remove/loading */}
                    <div className="flex items-center justify-between gap-3 text-sm text-zinc-500 dark:text-zinc-400">
                      <span className="text-xs md:text-sm">
                        {formatFileSize(file.size)}
                      </span>
                      <span className="flex items-center gap-1.5">
                        <span className="font-medium">
                          {Math.round(file.progress)}%
                        </span>
                        {file.progress < 100 ? (
                          <Loader className="w-4 h-4 animate-spin text-blue-500" />
                        ) : (
                          <Trash2
                            className="w-4 h-4 cursor-pointer text-zinc-400 hover:text-red-500 dark:text-zinc-500 dark:hover:text-red-400 transition-colors duration-200"
                            onClick={(e) => {
                              e.stopPropagation();
                              setFiles((prev) =>
                                prev.filter((f) => f.id !== file.id)
                              );
                            }}
                            aria-label="Remove file"
                          />
                        )}
                      </span>
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full h-2 bg-zinc-200 dark:bg-zinc-700 rounded-full overflow-hidden mt-3">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${file.progress}%` }}
                      transition={{
                        duration: 0.4,
                        type: "spring",
                        stiffness: 100,
                        ease: "easeOut",
                      }}
                      className={clsx(
                        "h-full rounded-full shadow-inner",
                        file.progress < 100 
                          ? (file.isFromText ? "bg-green-500" : "bg-blue-500")
                          : "bg-emerald-500"
                      )}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}