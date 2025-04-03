import React, { useState, useEffect } from 'react';
import { Card } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Loader2, Search, Database, Image, CheckCircle2, Diff } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ModelDialog } from '@/components/custom';
import { ModelData } from '@/types/llm';
import { useNavigate } from 'react-router-dom';

const LLMComparison: React.FC = () => {
  const [models, setModels] = useState<ModelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedModel, setSelectedModel] = useState<ModelData | null>(null);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  
  const navigate = useNavigate();

  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true);
        // Fetch from OpenRouter API
        const response = await fetch(`https://openrouter.ai/api/v1/models`);
        if (!response.ok) {
          throw new Error(`Failed to fetch LLMs: ${response.status}`);
        }
        const responseData = await response.json();
        // Check if data is in the expected format (data array in the API response)
        if (responseData && Array.isArray(responseData.data)) {
          setModels(responseData.data);
          setError(null);
        } else {
          console.error('Unexpected API response format:', responseData);
          setError('Unexpected API response format');
          setModels([]);
        }
      } catch (err) {
        console.error('Failed to fetch LLMs:', err);
        setError(err instanceof Error ? err.message : 'Failed to fetch LLMs');
        setModels([]);
      } finally {
        setLoading(false);
      }
    };

    fetchModels();
  }, []);

  // Filter models based on search query
  const filteredModels = models.filter(model => {
    if (!searchQuery.trim()) return true;

    const lowercaseQuery = searchQuery.toLowerCase();
    const name = model.name.toLowerCase();
    const description = model.description?.toLowerCase() || '';
    const provider = model.id.split('/')[0].toLowerCase();

    return (
      name.includes(lowercaseQuery) ||
      description.includes(lowercaseQuery) ||
      provider.includes(lowercaseQuery)
    );
  });

  // Format date from timestamp
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("en-US", {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  };

  // Format token count
  const formatTokenCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
    return count.toString();
  };

  // Format price display
  const formatPrice = (price: string) => {
    if (price === "-1") return "Variable";
    if (price === "0") return "Free";
    
    const priceNum = parseFloat(price);
    
    if (priceNum === 0) return "$0.00";
    if (priceNum < 0.000001) return `$${(priceNum * 1000000).toFixed(4)}µ`;
    if (priceNum < 0.001) return `$${(priceNum * 1000).toFixed(4)}m`;
    
    return `$${priceNum.toFixed(6)}`;
  };

  // Get a badge color for modality type
  const getModalityColor = (modality: string) => {
    switch (modality) {
      case "text->text":
        return "bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-300";
      case "text+image->text":
        return "bg-purple-100 text-purple-800 dark:bg-purple-900/20 dark:text-purple-300";
      default:
        return "bg-gray-100 text-gray-800 dark:bg-gray-900/20 dark:text-gray-300";
    }
  };

  const handleModelClick = (model: ModelData) => {
    setSelectedModel(model);
    setIsDialogOpen(true);
  };

  const toggleModelSelection = (modelId: string, event: React.MouseEvent) => {
    event.stopPropagation();
    
    setSelectedModels(prev => {
      if (prev.includes(modelId)) {
        return prev.filter(id => id !== modelId);
      } else {
        // Limit to max 4 models for comparison
        if (prev.length >= 4) {
          return prev;
        }
        return [...prev, modelId];
      }
    });
  };

  const handleCompareClick = () => {
    if (selectedModels.length > 1) {
      navigate(`/dashboard/llm-comparison/compare?models=${selectedModels.join(',')}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <Alert className="m-6">
        <AlertDescription>{error}</AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="p-6 space-y-6
        max-h-[92vh] overflow-y-auto
        scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
        [&::-webkit-scrollbar]:w-1.5 
        [&::-webkit-scrollbar-track]:bg-transparent 
        [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
      <div className='flex items-center justify-between md:flex-row gap-4 items-start md:items-end'>
        <div>
          <h1 className='text-5xl font-[Anton] uppercase font-bold text-gray-800/30 dark:text-gray-700/50'>LLM Comparison</h1>
          <div className="w-full md:w-96 mt-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, provider, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8"
              />
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <p className="text-sm text-gray-500 dark:text-gray-400">Compare capabilities, pricing, and features of various LLMs</p>
          
          {selectedModels.length > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">
                {selectedModels.length} model{selectedModels.length !== 1 ? 's' : ''} selected
              </span>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={handleCompareClick}
                disabled={selectedModels.length < 2}
                className={selectedModels.length >= 2 ? "bg-blue-500 hover:bg-blue-600 text-white" : ""}
              >
                <Diff className="h-4 w-4 mr-1" />
                Compare Models
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* No results message */}
      {filteredModels.length === 0 && (
        <Alert className="my-6 bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <AlertDescription>
            {searchQuery
              ? `No LLMs matching "${searchQuery}"`
              : "No LLMs found"}
          </AlertDescription>
        </Alert>
      )}

      {/* LLMs table */}
      {filteredModels.length > 0 && (
        <Card className="bg-gray-100 dark:bg-transparent border-gray-200 dark:border-gray-900/10 rounded-2xl shadow-none">
          <div className="rounded-md border">
            <ModelDialog
              model={selectedModel}
              open={isDialogOpen}
              onOpenChange={setIsDialogOpen}
            />
            <Table className="bg-gray-50 dark:bg-transparent rounded-2xl">
              <TableHeader>
                <TableRow className="border-b border-gray-400 dark:border-gray-800/80">
                  <TableHead className="w-12">Compare</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Provider</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead className="text-center">Context</TableHead>
                  <TableHead className="text-center">Input Price</TableHead>
                  <TableHead className="text-center">Output Price</TableHead>
                  <TableHead className="text-center">Released</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredModels.map((model) => {
                  // Extract provider name from id
                  const provider = model.id.split('/')[0];
                  const isMultimodal = model.architecture.input_modalities.includes("image");
                  const isSelected = selectedModels.includes(model.id);
                  
                  return (
                    <TableRow
                      key={model.id}
                      className="bg-gray-50 dark:bg-transparent border-b border-gray-400 dark:border-gray-800/80 hover:cursor-pointer hover:bg-gray-300/50 dark:hover:bg-gray-800/30"
                      onClick={() => handleModelClick(model)}
                    >
                      <TableCell className="w-12" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-center">
                          <button 
                            onClick={(e) => toggleModelSelection(model.id, e)}
                            className={`p-1 rounded-full ${isSelected ? 'text-blue-500' : 'text-gray-400 hover:text-gray-600 dark:hover:text-gray-300'}`}
                          >
                            <CheckCircle2 className={`h-5 w-5 ${isSelected ? 'fill-blue-500' : ''}`} />
                          </button>
                        </div>
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="hover:text-blue-500 hover:underline flex items-center gap-2">
                          {model.name}
                          {isMultimodal && (
                            <Badge 
                              className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                            >
                              <Image className="h-3 w-3 mr-1" />
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm font-medium capitalize">{provider}</div>
                      </TableCell>
                      <TableCell>
                        <Badge className={getModalityColor(model.architecture.modality)}>
                          {model.architecture.modality}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1 text-sm">
                          <Database className="h-3.5 w-3.5 text-gray-500" />
                          {formatTokenCount(model.context_length)}
                        </div>
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        {formatPrice(model.pricing.prompt)}
                      </TableCell>
                      <TableCell className="text-center font-mono text-xs">
                        {formatPrice(model.pricing.completion)}
                      </TableCell>
                      <TableCell className="text-center">
                        {formatDate(model.created)}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}
    </div>
  );
};

export default LLMComparison;