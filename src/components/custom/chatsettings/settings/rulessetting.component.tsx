import React, { useState } from 'react';
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Save, X, UserCog, ClipboardList } from "lucide-react";
import { SiKubernetes } from '@icons-pack/react-simple-icons';

interface Rule {
  id: number;
  content: string;
  name: string;
}

type RuleType = 'user' | 'cluster';

interface ShowAddForm {
  type: RuleType | null;
  show: boolean;
}

interface AddRuleFormProps {
  type: RuleType;
  onSave: (type: RuleType, content: string) => void;
  onCancel: () => void;
}

interface RuleItemProps {
  rule: Rule;
  type: RuleType;
  onEdit: (rule: Rule) => void;
  onDelete: (type: RuleType, id: number) => void;
  onSaveEdit: (type: RuleType, id: number, content: string) => void;
  isEditing: boolean;
  onCancelEdit: () => void;
}

const RulesSetting: React.FC = () => {
  const [userRules, setUserRules] = useState<Rule[]>([]);
  const [clusterRules, setClusterRules] = useState<Rule[]>([]);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);
  const [showAddForm, setShowAddForm] = useState<ShowAddForm>({ type: null, show: false });

  // Add new rule
  const handleAddRule = (type: RuleType): void => {
    setShowAddForm({ type, show: true });
  };

  // Save new rule
  const handleSaveNewRule = (type: RuleType, content: string): void => {
    const newRule: Rule = {
      id: Date.now(),
      content: content.trim(),
      name: type === 'user' ? 'user_rules.md' : 'cluster_rules.md'
    };

    if (type === 'user') {
      setUserRules([newRule]); // Only allow one user rule
    } else {
      setClusterRules([newRule]); // Only allow one cluster rule
    }

    setShowAddForm({ type: null, show: false });
    
    // TODO: Make API call to save rule
    console.log('API Call - Save rule:', { type, rule: newRule });
  };

  // Delete rule
  const handleDeleteRule = (type: RuleType, id: number): void => {
    if (type === 'user') {
      setUserRules(userRules.filter(rule => rule.id !== id));
    } else {
      setClusterRules(clusterRules.filter(rule => rule.id !== id));
    }
    
    // TODO: Make API call to delete rule
    console.log('API Call - Delete rule:', { type, id });
  };

  // Edit rule
  const handleEditRule = (rule: Rule): void => {
    setEditingRule(rule);
  };

  // Save edited rule
  const handleSaveEdit = (type: RuleType, id: number, newContent: string): void => {
    const updateRules = (rules: Rule[]): Rule[] => 
      rules.map(rule => 
        rule.id === id ? { ...rule, content: newContent.trim() } : rule
      );

    if (type === 'user') {
      setUserRules(updateRules(userRules));
    } else {
      setClusterRules(updateRules(clusterRules));
    }

    setEditingRule(null);
    
    // TODO: Make API call to update rule
    console.log('API Call - Update rule:', { type, id, content: newContent });
  };

  const AddRuleForm: React.FC<AddRuleFormProps> = ({ type, onSave, onCancel }) => {
    const [content, setContent] = useState<string>('');

    const handleSave = (): void => {
      if (content.trim()) {
        onSave(type, content);
      }
    };

    return (
      <div className="bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg p-4 mt-2">
        <div className="mb-3">
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            {type === 'user' ? 'User Rule' : 'Cluster Rule'}
          </label>
          <textarea
            value={content}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setContent(e.target.value)}
            placeholder={`Enter your ${type} rule here...`}
            className="w-full h-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <div className="flex justify-end space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onCancel}
          >
            <X className="w-4 h-4 mr-1" />
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleSave}
            disabled={!content.trim()}
          >
            <Save className="w-4 h-4 mr-1" />
            Save Rule
          </Button>
        </div>
      </div>
    );
  };

  const RuleItem: React.FC<RuleItemProps> = ({ 
    rule, 
    type, 
    onEdit, 
    onDelete, 
    onSaveEdit, 
    isEditing, 
    onCancelEdit 
  }) => {
    const [editContent, setEditContent] = useState<string>(rule.content);

    const handleSaveEdit = (): void => {
      if (editContent.trim()) {
        onSaveEdit(type, rule.id, editContent);
      }
    };

    const handleEditChange = (e: React.ChangeEvent<HTMLTextAreaElement>): void => {
      setEditContent(e.target.value);
    };

    return (
      <div className="bg-white dark:bg-gray-800/50 border border-gray-300 dark:border-gray-600/30 rounded-lg">
        {isEditing ? (
          <div>
            <textarea
              value={editContent}
              onChange={handleEditChange}
              className="w-full h-24 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-900 text-gray-900 dark:text-gray-100 resize-none focus:ring-2 focus:ring-blue-500 focus:border-transparent mb-3"
            />
            <div className="flex justify-end space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={onCancelEdit}
              >
                <X className="w-4 h-4 mr-1" />
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSaveEdit}
                disabled={!editContent.trim()}
              >
                <Save className="w-4 h-4 mr-1" />
                Save
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <div className="flex items-start justify-between">
              <div className="flex items-center p-2">
                {type === 'user' ? (
                  <UserCog className="w-4 h-4 text-gray-500 mr-2" />
                ) : (
                  <SiKubernetes className="w-4 h-4 text-gray-500 mr-2" />
                )}
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {rule.name}
                </span>
              </div>

              <div className="flex">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onEdit(rule)}
                >
                  <Edit className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => onDelete(type, rule.id)}
                  className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 border-l border-gray-400/50 dark:border-gray-700"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className='flex items-center space-x-2'>
        <ClipboardList className='text-rose-500' />
        <h1 className='text-2xl font-medium'>Rules</h1>
      </div>
      {/* User Rules Section */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
          User Rules
        </h3>
        <div className="bg-gray-200 dark:bg-gray-700/20 rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Define usage preferences here, such as the output language for Agentkube, or whether code generation should include comments by default, etc. Agentkube will follow your personal preference rules during chats, and the rules will remain effective when switching projects.
          </p>
          
          {userRules.length > 0 && (
            <div className="mb-4">
              {userRules.map((rule: Rule) => (
                <RuleItem 
                  key={rule.id} 
                  rule={rule} 
                  type="user"
                  onEdit={handleEditRule}
                  onDelete={handleDeleteRule}
                  onSaveEdit={handleSaveEdit}
                  isEditing={editingRule?.id === rule.id}
                  onCancelEdit={() => setEditingRule(null)}
                />
              ))}
            </div>
          )}

          {showAddForm.type === 'user' && showAddForm.show ? (
            <AddRuleForm
              type="user"
              onSave={handleSaveNewRule}
              onCancel={() => setShowAddForm({ type: null, show: false })}
            />
          ) : userRules.length === 0 ? (
            <Button 
              variant="outline" 
              size="sm" 
              className="text-gray-600 dark:text-gray-400"
              onClick={() => handleAddRule('user')}
            >
              <Plus className="w-4 h-4 mr-1" />
              Create user_rules.md
            </Button>
          ) : null}
        </div>
      </div>

      {/* Cluster Rules Section */}
      <div>
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-4">
          Cluster Rules
        </h3>
        <div className="bg-gray-200 dark:bg-gray-700/20 rounded-lg p-4">
          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Create the .agentkube/rules/cluster_rules.md file within a project to define the rules Agentkube should follow when conversing in the current project.
          </p>
          
          {clusterRules.length > 0 && (
            <div className="mb-4">
              {clusterRules.map((rule: Rule) => (
                <RuleItem 
                  key={rule.id} 
                  rule={rule} 
                  type="cluster"
                  onEdit={handleEditRule}
                  onDelete={handleDeleteRule}
                  onSaveEdit={handleSaveEdit}
                  isEditing={editingRule?.id === rule.id}
                  onCancelEdit={() => setEditingRule(null)}
                />
              ))}
            </div>
          )}

          {showAddForm.type === 'cluster' && showAddForm.show ? (
            <AddRuleForm
              type="cluster"
              onSave={handleSaveNewRule}
              onCancel={() => setShowAddForm({ type: null, show: false })}
            />
          ) : clusterRules.length === 0 ? (
            <Button 
              variant="outline" 
              size="sm" 
              className="text-gray-600 dark:text-gray-400"
              onClick={() => handleAddRule('cluster')}
            >
              <Plus className="w-4 h-4 mr-1" />
              Create cluster_rules.md
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default RulesSetting;