import React, { useRef, useEffect } from 'react';
import MonacoEditor, { OnMount } from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { shikiToMonaco } from '@shikijs/monaco';
import { createHighlighter, Highlighter } from 'shiki';
import { themeSlugs } from '@/constants/theme.constants';
import { useDrawer } from '@/contexts/useDrawer';

interface CustomMonacoEditorProps {
  value: string;
  onChange: (value: string | undefined) => void;
  theme: string;
  onCodeSelection?: () => void; // Optional callback for when code is selected
}

let highlighterInstance: Highlighter | null = null;
let highlighterPromise: Promise<Highlighter> | null = null;

const getHighlighter = async (): Promise<Highlighter> => {
  if (highlighterInstance) {
    return highlighterInstance;
  }
  
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({
      themes: themeSlugs,
      langs: ['yaml', 'typescript', 'javascript', 'json', 'go', 'rust', 'nginx', 'python', 'java'],
    });
  }
  
  highlighterInstance = await highlighterPromise;
  return highlighterInstance;
};

const CustomMonacoEditor: React.FC<CustomMonacoEditorProps> = ({
  value,
  onChange,
  theme,
  onCodeSelection,
}) => {
  const { addStructuredContent, setIsOpen } = useDrawer();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);
  const widgetRef = useRef<HTMLDivElement | null>(null);
  const copilotWidgetRef = useRef<HTMLDivElement | null>(null);
  
  const createWidget = () => {
    if (!widgetRef.current) {
      const widget = document.createElement('div');
      widget.className = `
        p-1 rounded-[0.5rem] shadow-lg border flex gap-2 absolute z-50
        ${theme !== 'vs-dark' ? 'bg-[#1e1e1e] border-gray-800' : 'bg-white border-gray-200'}
      `;
      widget.style.display = 'none';
      widgetRef.current = widget;
      document.body.appendChild(widget);
    }
    return widgetRef.current;
  };

  const createCopilotWidget = () => {
    if (!copilotWidgetRef.current) {
      const widget = document.createElement('div');
      const isDarkTheme = theme !== 'vs-dark';
      widget.className = `
        absolute z-50 w-[600px] shadow-lg border border-gray-600/50 rounded-[0.5rem]
        ${isDarkTheme ? 'bg-[#0B0D13]/50' : 'bg-white'}
      `;
      widget.innerHTML = `
        <div class="flex items-center px-3 py-2 gap-2 border-b rounded-t-[0.5rem] ${isDarkTheme ? 'bg-[#0B0D13] border-gray-800/50 text-[#cccccc]' : 'bg-gray-100 border-gray-200 text-gray-700'}">
          <span class="text-xs opacity-70">Editing instructions... (↑↓ for history, @ for code / documentation)</span>
          <div class="flex-1"></div>
          <span class="text-xs opacity-70">Esc to close</span>
        </div>
        <input type="text" 
          class="w-full px-3 py-2 text-sm outline-none border-none rounded-b-[0.5rem] ${
            isDarkTheme
              ? 'bg-[#0B0D13]/50 backdrop-blur-md text-[#cccccc] placeholder-[#6c6c6c]'
              : 'bg-white text-gray-900 placeholder-gray-500'
          }"
          placeholder="Ask a question about the code..." 
        />
      `;
      
      widget.style.display = 'none';
      copilotWidgetRef.current = widget;
      document.body.appendChild(widget);
  
      // Add event listener to input
      const input = widget.querySelector('input');
      if (input) {
        input.addEventListener('keydown', (e: KeyboardEvent) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            const inputValue = (e.target as HTMLInputElement).value;
            handleCopilotSubmit(inputValue);
          }
          if (e.key === 'Escape') {
            e.preventDefault();
            hideCopilotWidget();
          }
        });
      }
    }
    return copilotWidgetRef.current;
  };

  const showCopilotWidget = (editor: monaco.editor.IStandaloneCodeEditor) => {
    const widget = createCopilotWidget();
    const editorDomNode = editor.getDomNode();
    if (!editorDomNode || !widget) return;

    const position = editor.getPosition();
    if (!position) return;

    const cursorCoords = editor.getScrolledVisiblePosition(position);
    if (!cursorCoords) return;

    const editorRect = editorDomNode.getBoundingClientRect();

    widget.style.display = 'block';
    widget.style.left = `${editorRect.left + cursorCoords.left}px`;
    widget.style.top = `${editorRect.top + cursorCoords.top - widget.offsetHeight - 10}px`;

    // Focus the input
    const input = widget.querySelector('input');
    if (input) {
      input.focus();
    }
  };

  const hideCopilotWidget = () => {
    if (copilotWidgetRef.current) {
      copilotWidgetRef.current.style.display = 'none';
      // Clear input value
      const input = copilotWidgetRef.current.querySelector('input');
      if (input) {
        (input as HTMLInputElement).value = '';
      }
    }
  };

  const handleCopilotSubmit = async (prompt: string) => {
    // Add the prompt as structured content to the main drawer
    addStructuredContent(prompt, 'Editor Query');
    setIsOpen(true);
    hideCopilotWidget();
  };

  const wrapWithCodeBlock = (text: string): string => {
    const model = editorRef.current?.getModel();
    if (!model) return text;
    return `\`\`\`\n${text}\n\`\`\``;
  };

  const showSuggestions = (editor: monaco.editor.IStandaloneCodeEditor) => {
    const selection = editor.getSelection();
    if (!selection) return;

    if (selection.isEmpty()) {
      if (widgetRef.current) {
        widgetRef.current.style.display = 'none';
      }
      return;
    }

    const selectedText = editor.getModel()?.getValueInRange(selection) || '';
    if (!selectedText) return;

    const widget = createWidget();
    const editorDomNode = editor.getDomNode();
    if (!editorDomNode) return;

    const selectionPos = editor.getScrolledVisiblePosition(selection.getStartPosition());
    if (!selectionPos) return;

    const editorRect = editorDomNode.getBoundingClientRect();
    
    const isDarkTheme = theme !== 'vs-dark';
    widget.innerHTML = `
      <button class="flex items-center gap-1 px-2 py-1 rounded hover:bg-opacity-80 transition-colors bg-[#1e1e1e] text-md
        ${isDarkTheme ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100 text-gray-700'}">
        <span class="flex items-center text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#9ca3af" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-command">
          <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>
          </svg>
         K
        </span>
        Chat
      </button>
      <button class="flex items-center gap-1 px-2 py-1 rounded hover:bg-opacity-80 transition-colors bg-[#1e1e1e] text-md
        ${isDarkTheme ? 'hover:bg-gray-700 text-gray-200' : 'hover:bg-gray-100 text-gray-700'}">
        <span class="flex items-center text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="#9ca3af" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-command">
          <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3"/>
          </svg>
         O
        </span>
        Edit
      </button>
    `;
    const leftPosition = Math.max(0, editorRect.left + selectionPos.left);
    const topPosition = Math.max(0, editorRect.top + selectionPos.top - 40);

    widget.style.display = 'flex';
    widget.style.left = `${leftPosition}px`;
    widget.style.top = `${topPosition}px`;

    // Add event listeners
    const buttons = widget.querySelectorAll('button');
    buttons[0]?.addEventListener('click', () => {
      const wrappedText = wrapWithCodeBlock(selectedText);
      addStructuredContent(wrappedText, 'Code Selection');
      
      // Call the optional callback for adding resource context (for existing resources)
      if (onCodeSelection) {
        onCodeSelection();
      }
      
      setIsOpen(true);
    });

    buttons[1]?.addEventListener('click', () => {
      showCopilotWidget(editor)
    });

  };

  const handleEditorDidMount: OnMount = async (editor, monaco) => {
    editorRef.current = editor;

    const highlighter = await getHighlighter();
    
    // 2. Register Shiki themes with Monaco
    shikiToMonaco(highlighter, monaco);

    // 3. Activate the requested theme
    monaco.editor.setTheme(theme);

    createWidget();
    createCopilotWidget();

    const selectionDisposable = editor.onDidChangeCursorSelection(() => {
      showSuggestions(editor);
    });

    const clickHandler = (e: MouseEvent) => {
      const editor = editorRef.current;
      if (!editor) return;

      const selection = editor.getSelection();
      const editorDomNode = editor.getDomNode();
      const isClickInEditor = editorDomNode?.contains(e.target as Node);
      const isClickInWidget = widgetRef.current?.contains(e.target as Node);
      const isClickInCopilotWidget = copilotWidgetRef.current?.contains(e.target as Node);

      if (!isClickInEditor && !isClickInWidget && !isClickInCopilotWidget && (!selection || selection.isEmpty())) {
        if (widgetRef.current) {
          widgetRef.current.style.display = 'none';
        }
        if (copilotWidgetRef.current && !isClickInCopilotWidget) {
          hideCopilotWidget();
        }
      }
  };
    document.addEventListener('click', clickHandler);

    // Add Cmd+K handler
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
      () => {
        const selection = editor.getSelection();
        if (selection) {
          const selectedText = editor.getModel()?.getValueInRange(selection) || '';
          if (selectedText) {
            const wrappedText = wrapWithCodeBlock(selectedText);
            addStructuredContent(wrappedText, 'Code Selection');
            
            // Call the optional callback for adding resource context (for existing resources)
            if (onCodeSelection) {
              onCodeSelection();
            }
            
            setIsOpen(true);
          }
        }
      }
    );

    // Add Cmd+O handler for Copilot
    editor.addCommand(
      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyO,
      () => {
        showCopilotWidget(editor);
      }
    );

    return () => {
      selectionDisposable.dispose();
      document.removeEventListener('click', clickHandler);
    };
  };

  useEffect(() => {
    return () => {
      if (widgetRef.current && widgetRef.current.parentNode) {
        widgetRef.current.parentNode.removeChild(widgetRef.current);
      }
      if (copilotWidgetRef.current && copilotWidgetRef.current.parentNode) {
        copilotWidgetRef.current.parentNode.removeChild(copilotWidgetRef.current);
      }
    };
  }, []);

  return (
    <MonacoEditor
      height="81vh"
      defaultLanguage="yaml"
      value={value}
      onChange={onChange}
      theme={theme}
      onMount={handleEditorDidMount}
      options={{
        minimap: { enabled: false },
        fontSize: 14,
        lineNumbers: 'on',
        roundedSelection: false,
        scrollBeyondLastLine: false,
        // wordWrap: 'on',
        // folding: true,
        tabSize: 2,
        automaticLayout: true,
        quickSuggestions: true,
        formatOnPaste: true,
        formatOnType: true
      }}
    />
  );
};

export default CustomMonacoEditor;