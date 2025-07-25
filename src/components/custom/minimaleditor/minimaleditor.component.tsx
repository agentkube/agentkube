import React, { useState } from 'react';
import MonacoEditor, { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { shikiToMonaco } from '@shikijs/monaco';
import { createHighlighter } from 'shiki';
import { themeSlugs } from '@/constants/theme.constants';

interface MinimalEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
  language?: string;
  height?: string;
  placeholder?: string;
  className?: string;
  options?: monaco.editor.IStandaloneEditorConstructionOptions;
}

const MinimalEditor: React.FC<MinimalEditorProps> = ({
  value,
  onChange,
  language = 'markdown',
  height = '150px',
  placeholder,
  className = '',
  options = {}
}) => {
  // Get theme from localStorage
  const [editorTheme] = useState<string>(() => {
    const cached = localStorage.getItem('editor_theme');
    return cached || 'github-dark';
  });

  const handleEditorDidMount: OnMount = async (editor, monaco) => {
    const highlighter = await createHighlighter({
      themes: themeSlugs,
      langs: ['markdown', 'json', 'yaml', 'typescript', 'javascript', 'go', 'rust', 'nginx', 'python', 'java'],
    });

    // Register Shiki themes with Monaco
    shikiToMonaco(highlighter, monaco);

    // Activate the requested theme
    monaco.editor.setTheme(editorTheme);

    // Add placeholder support
    if (placeholder && !value) {
      const model = editor.getModel();
      if (model) {
        model.setValue(placeholder);
        editor.setSelection(new monaco.Selection(1, 1, 1, placeholder.length + 1));
      }
    }
  };

  const defaultOptions: monaco.editor.IStandaloneEditorConstructionOptions = {
    minimap: { enabled: false },
    fontSize: 10,
    lineNumbers: 'off',
    roundedSelection: false,
    scrollBeyondLastLine: false,
    tabSize: 2,
    automaticLayout: true,
    quickSuggestions: language === 'json',
    formatOnPaste: true,
    formatOnType: true,
    wordWrap: 'on',
    folding: false,
    glyphMargin: false,
    lineDecorationsWidth: 0,
    lineNumbersMinChars: 0,
    overviewRulerLanes: 0,
    scrollbar: {
      vertical: 'auto',
      horizontal: 'auto'
    },
    ...options
  };

  return (
    <div className={`border border-gray-300 dark:border-gray-600 rounded-md overflow-hidden ${className}`}>
      <MonacoEditor
        height={height}
        defaultLanguage={language}
        value={value}
        onChange={onChange}
        theme={editorTheme}
        onMount={handleEditorDidMount}
        options={defaultOptions}
      />
    </div>
  );
};

export default MinimalEditor;