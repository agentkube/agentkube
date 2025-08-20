import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Brain, Plus, Save, X, FileX, BookOpen, Info } from "lucide-react";
import { MinimalEditor } from '@/components/custom';
import { getKubeignore, updateKubeignore } from '@/api/settings';

const ContextSetting = () => {
  const [showIgnoreForm, setShowIgnoreForm] = useState(false);
  const [showDocsForm, setShowDocsForm] = useState(false);
  const [ignoreContent, setIgnoreContent] = useState('');
  const [docsContent, setDocsContent] = useState('');
  const [savedIgnoreRules, setSavedIgnoreRules] = useState('');
  const [savedDocs, setSavedDocs] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    loadKubeignore();
  }, []);

  const kubeignoreTemplate = `# ---------------------------------------------------
#  Ignore all objects in system or monitoring NS
# ---------------------------------------------------
namespace: kube-system
namespace: monitoring

# ---------------------------------------------------
#  Ignore Secrets & ConfigMaps entirely
# ---------------------------------------------------
# kind: Secret
# kind: ConfigMap

# ──────────────────────────────────────────────────
# Skip by kind or API group/kind
# ──────────────────────────────────────────────────
# kind: Secret
# kind: ConfigMap
# gvk: apps/v1/Deployment

# Ignore all Jobs in qa namespace
# gvkn: batch/v1/Job/qa/*

# ---------------------------------------------------
#  Ignore standalone custom resource "MyCRD" in apiGroup v1alpha1
# ---------------------------------------------------
# gvk: mygroup.example.com/v1alpha1/MyCRD

# ──────────────────────────────────────────────────
# Skip any resource labeled skip-ci=true
# ──────────────────────────────────────────────────
# label: skip-ci=true

# Skip resources with tier label starting “dev-”
# label: tier=dev-*

# Skip anything annotated audit.k8s.io/ignore=always
# annotation:audit.k8s.io/ignore=always
`;

  const docsTemplate = `# Project Documentation

## Overview
Add your project documentation here...

## API Endpoints
- GET /api/users - Get all users
- POST /api/users - Create new user
- PUT /api/users/:id - Update user
- DELETE /api/users/:id - Delete user

## Environment Variables
- DATABASE_URL: Connection string for database
- API_KEY: API key for external service
- PORT: Server port (default: 3000)

## Deployment
\`\`\`bash
kubectl apply -f manifests/
\`\`\``;

  const loadKubeignore = async () => {
    try {
      setIsLoading(true);
      const response = await getKubeignore();
      setSavedIgnoreRules(response.content);
    } catch (error) {
      console.error('Failed to load kubeignore:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveIgnoreRules = async () => {
    if (ignoreContent.trim()) {
      try {
        setIsLoading(true);
        await updateKubeignore(ignoreContent);
        setSavedIgnoreRules(ignoreContent);
        setShowIgnoreForm(false);
        setIgnoreContent('');
      } catch (error) {
        console.error('Failed to save kubeignore:', error);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleSaveDocs = () => {
    if (docsContent.trim()) {
      setSavedDocs(docsContent);
      setShowDocsForm(false);
      setDocsContent('');
      // TODO: Make API call to save docs
      console.log('API Call - Save docs:', docsContent);
    }
  };

  const handleCancelIgnore = () => {
    setShowIgnoreForm(false);
    setIgnoreContent('');
  };

  const handleCancelDocs = () => {
    setShowDocsForm(false);
    setDocsContent('');
  };

  const handleConfigureIgnore = () => {
    setIgnoreContent(kubeignoreTemplate);
    setShowIgnoreForm(true);
  };

  const handleAddDocs = () => {
    setDocsContent(docsTemplate);
    setShowDocsForm(true);
  };

  return (
    <div className="space-y-6">
      <div className='flex items-center space-x-2'>
        <Brain className='text-orange-500' />
        <h1 className='text-2xl font-medium'>Context</h1>
      </div>
      
      {/* Ignore Files */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
          Ignore Resources
        </h3>
        <div className="bg-gray-200 dark:bg-gray-700/20 rounded-lg p-4">
          <div className="flex items-start space-x-3 mb-4">
            <Info className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                Configure the list of resources that would be ignored by Agentkube when indexing your repository. These ignored resources will be in addition to those specified in your .kubeignore.
              </p>
              <div className="text-xs text-gray-500 dark:text-gray-500">
                <strong>Supported rule types:</strong> namespace:, kind:, name:, file:, gvk:, gvkname:
              </div>
            </div>
          </div>

          {savedIgnoreRules && !showIgnoreForm && (
            <div className="mb-4">
              <div className="border border-gray-300 dark:border-gray-600/30 rounded-lg">
                <div className="flex items-start justify-between p-3">
                  <div className="flex items-center">
                    <div className='p-1 rounded-md w-fit mr-2'>
                      <FileX className="w-4 h-4 text-red-500" />
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      .kubeignore
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setIgnoreContent(savedIgnoreRules);
                      setShowIgnoreForm(true);
                    }}
                  >
                    Edit
                  </Button>
                </div>
                <div className="px-3 pb-3 max-h-40 overflow-y-auto">
                  <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                    {savedIgnoreRules}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {showIgnoreForm ? (
            <div className="space-y-3 pl-7">
              <MinimalEditor
                value={ignoreContent}
                onChange={(value) => setIgnoreContent(value || '')}
                language="yaml"
                height="200px"
                placeholder={kubeignoreTemplate}
              />
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelIgnore}
                >
                  <X className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveIgnoreRules}
                  disabled={!ignoreContent.trim() || isLoading}
                >
                  <Save className="w-4 h-4 mr-1" />
                  {isLoading ? 'Saving...' : 'Save .kubeignore'}
                </Button>
              </div>
            </div>
          ) : !savedIgnoreRules ? (
            <Button
              variant="outline"
              size="sm"
                   className="text-gray-600 dark:text-gray-400"
              onClick={handleConfigureIgnore}
            >
              <Plus className="w-4 h-4 mr-1" />
              Configure ignored Resources
            </Button>
          ) : null}
        </div>
      </div>

      {/* Add Docs */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
          Add Docs
        </h3>
        <div className="bg-gray-200 dark:bg-gray-700/20 rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Add common docs through URL or local upload as Context for AI Q&A.
          </p>

          {savedDocs && !showDocsForm && (
            <div className="mb-4">
              <div className="border border-gray-300 dark:border-gray-600/30 rounded-lg">
                <div className="flex items-start justify-between p-3">
                  <div className="flex items-center">
                    <div className='p-1 rounded-md w-fit mr-2'>
                      <BookOpen className="w-4 h-4 text-blue-500" />
                    </div>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      documentation.md
                    </span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setDocsContent(savedDocs);
                      setShowDocsForm(true);
                    }}
                  >
                    Edit
                  </Button>
                </div>
                <div className="px-3 pb-3 max-h-40 overflow-y-auto">
                  <pre className="text-xs text-gray-600 dark:text-gray-400 whitespace-pre-wrap">
                    {savedDocs}
                  </pre>
                </div>
              </div>
            </div>
          )}

          {showDocsForm ? (
            <div className="space-y-3">
              <MinimalEditor
                value={docsContent}
                onChange={(value) => setDocsContent(value || '')}
                language="markdown"
                height="250px"
                placeholder={docsTemplate}
              />
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCancelDocs}
                >
                  <X className="w-4 h-4 mr-1" />
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveDocs}
                  disabled={!docsContent.trim()}
                >
                  <Save className="w-4 h-4 mr-1" />
                  Save Docs
                </Button>
              </div>
            </div>
          ) : !savedDocs ? (
            <Button
              variant="outline"
              size="sm"
              className="text-gray-600 dark:text-gray-400"
              onClick={handleAddDocs}
            >
              <Plus className="w-4 h-4 mr-1" />
              Add Docs
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default ContextSetting;