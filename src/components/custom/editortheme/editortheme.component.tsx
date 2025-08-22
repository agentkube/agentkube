import React, { useEffect, useState } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CustomMonacoEditor } from '@/components/custom';
import { Themes } from '@/constants/theme.constants';

const EditorTheme: React.FC = () => {
  const [selectedTheme, setSelectedTheme] = useState<string>(() => {
    const cached = localStorage.getItem('editor_theme');
    return cached || 'github-dark';
  });

  useEffect(() => {
    localStorage.setItem('editor_theme', selectedTheme);
  }, [selectedTheme]);

  const dummyYamlContent = `apiVersion: v1
kind: Pod
metadata:
  name: example-pod
  namespace: default
  labels:
    app: nginx
    version: "1.0"
spec:
  containers:
  - name: nginx
    image: nginx:latest
    ports:
    - containerPort: 80
      protocol: TCP
    env:
    - name: ENV_VAR
      value: "production"
    resources:
      requests:
        memory: "64Mi"
        cpu: "250m"
      limits:
        memory: "128Mi"
        cpu: "500m"`;

  // Dummy functions for the preview editor
  const handleDummyChange = () => { };
  const handleDummySetQuestion = () => { };
  const handleDummyChatSubmit = () => { };

  const handleThemeChange = (theme: string) => {
    setSelectedTheme(theme);
  };

  return (
    <div className="mb-8">
      <div className="flex justify-between items-center mb-2">
        <h2 className="text-lg font-medium">Editor Theme</h2>
      </div>
      <p className="text-gray-700 dark:text-gray-400 text-sm mb-4">
        Choose how the YAML editor appears and customize syntax highlighting.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Left side - Theme Dropdown */}
        <div className="space-y-4">
          <div>
            <Select
              value={selectedTheme}
              onValueChange={handleThemeChange}
            >
              <SelectTrigger className="w-full h-8">
                <SelectValue placeholder="Select editor theme" />
              </SelectTrigger>
              <SelectContent className='dark:bg-[#0B0D13]/50 backdrop-blur-md'>
                {Themes.map((theme) => (
                  <SelectItem key={theme.name} value={theme.name}>{theme.displayName} {theme.type === 'dark' && (<span className='text-xs dark:text-blue-500 dark:bg-blue-500/20 px-1.5 rounded-sm'>{theme.type}</span>)} </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Right side - Editor Preview */}
        <div className="border border-gray-300 dark:border-gray-500/20 rounded-lg overflow-hidden">
          <div className="bg-gray-100 dark:bg-[#0B0D13]/40 px-3 py-2 border-b border-gray-300 dark:border-gray-500/20">
            <span className="text-xs font-medium">Preview</span>
          </div>
          <div className="h-64">
            <CustomMonacoEditor
              value={dummyYamlContent}
              onChange={handleDummyChange}
              theme={selectedTheme}
              setQuestion={handleDummySetQuestion}
              handleChatSubmit={handleDummyChatSubmit}
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default EditorTheme;