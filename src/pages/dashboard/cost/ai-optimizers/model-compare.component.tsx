import React, { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { ModelData } from '@/types/llm';
import { Loader2, ArrowLeft, Database, Image, CheckCircle, X, Info, AlertTriangle } from 'lucide-react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbSeparator
} from "@/components/ui/breadcrumb";
import { ChevronRight } from "lucide-react";

const ModelComparison: React.FC = () => {
  const [models, setModels] = useState<ModelData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState("overview");

  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const fetchModels = async () => {
      try {
        setLoading(true);

        // Get model IDs from URL query params
        const params = new URLSearchParams(location.search);
        const modelIds = params.get('models')?.split(',') || [];

        if (modelIds.length === 0) {
          setError('No models selected for comparison');
          setLoading(false);
          return;
        }

        // Fetch from OpenRouter API
        const response = await fetch(`https://openrouter.ai/api/v1/models`);
        if (!response.ok) {
          throw new Error(`Failed to fetch LLMs: ${response.status}`);
        }

        const responseData = await response.json();

        // Check if data is in the expected format
        if (responseData && Array.isArray(responseData.data)) {
          // Filter only the selected models
          const selectedModels = responseData.data.filter(
            (model: ModelData) => modelIds.includes(model.id)
          );

          if (selectedModels.length === 0) {
            setError('None of the selected models were found');
          } else {
            setModels(selectedModels);
            setError(null);
          }
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
  }, [location.search]);

  // Format functions
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("en-US", {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  const formatTokenCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
    return count.toString();
  };

  const formatPrice = (price: string) => {
    if (price === "-1") return "Variable";
    if (price === "0") return "Free";

    const priceNum = parseFloat(price);

    if (priceNum === 0) return "$0.00";
    if (priceNum < 0.000001) return `$${(priceNum * 1000000).toFixed(4)}µ`;
    if (priceNum < 0.001) return `$${(priceNum * 1000).toFixed(4)}m`;

    return `$${priceNum.toFixed(6)}`;
  };

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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-gray-500" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={() => navigate('/dashboard/llm-comparison')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back to Models
          </Button>
        </div>

        <Alert variant="destructive" className="my-6">
          <AlertTriangle className="h-4 w-4 mr-2" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      </div>
    );
  }

  const maxContextLength = Math.max(...models.map(model => model.context_length));

  const modelNames = models.map(model => model.name).join(' vs ');

  return (
    <div className="p-6 space-y-6
        max-h-[92vh] overflow-y-auto
        scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
        [&::-webkit-scrollbar]:w-1.5 
        [&::-webkit-scrollbar-track]:bg-transparent 
        [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
        [&::-webkit-scrollbar-thumb]:rounded-full
        [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">

      <Breadcrumb className="mb-6">
        <BreadcrumbList>
          <BreadcrumbItem>
            <BreadcrumbLink onClick={() => navigate('/dashboard')}>Dashboard</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <ChevronRight className="h-4 w-4" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbLink onClick={() => navigate('/dashboard/llm-comparison')}>LLM Models</BreadcrumbLink>
          </BreadcrumbItem>
          <BreadcrumbSeparator>
            <ChevronRight className="h-4 w-4" />
          </BreadcrumbSeparator>
          <BreadcrumbItem>
            <BreadcrumbLink>{modelNames}</BreadcrumbLink>
          </BreadcrumbItem>
        </BreadcrumbList>
      </Breadcrumb>

      <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-3 mb-6">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="capabilities">Capabilities</TabsTrigger>
          <TabsTrigger value="pricing">Pricing</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Model Comparison Overview</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-100 dark:bg-gray-800/30">
                      <TableHead className="w-1/4">Specification</TableHead>
                      {models.map((model) => (
                        <TableHead key={model.id}>
                          <div className="font-medium">
                            {model.name}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {model.id.split('/')[0]}
                          </div>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <TableRow>
                      <TableCell className="font-medium">Type</TableCell>
                      {models.map((model) => (
                        <TableCell key={`${model.id}-type`}>
                          <Badge className={getModalityColor(model.architecture.modality)}>
                            {model.architecture.modality}
                          </Badge>
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Context Length</TableCell>
                      {models.map((model) => (
                        <TableCell key={`${model.id}-context`}>
                          <div className="flex items-center gap-1">
                            <Database className="h-3.5 w-3.5 text-gray-500" />
                            {formatTokenCount(model.context_length)}
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Input Modalities</TableCell>
                      {models.map((model) => (
                        <TableCell key={`${model.id}-input-modalities`}>
                          <div className="flex flex-wrap gap-1">
                            {model.architecture.input_modalities.map((modality) => (
                              <Badge key={modality} variant="outline" className="flex items-center gap-1">
                                {modality}
                              </Badge>
                            ))}
                          </div>
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Tokenizer</TableCell>
                      {models.map((model) => (
                        <TableCell key={`${model.id}-tokenizer`}>
                          {model.architecture.tokenizer || "Not specified"}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Release Date</TableCell>
                      {models.map((model) => (
                        <TableCell key={`${model.id}-released`}>
                          {formatDate(model.created)}
                        </TableCell>
                      ))}
                    </TableRow>
                    <TableRow>
                      <TableCell className="font-medium">Moderation</TableCell>
                      {models.map((model) => (
                        <TableCell key={`${model.id}-moderation`}>
                          {model.top_provider.is_moderated ? (
                            <Badge variant="destructive">Moderated</Badge>
                          ) : (
                            <Badge variant="outline">Unmoderated</Badge>
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Model Descriptions</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-4">
              {models.map((model) => (
                <div
                  key={`${model.id}-description`}
                  className="p-4 border rounded-md bg-gray-50 dark:bg-gray-800/20"
                >
                  <h3 className="text-lg font-medium mb-2">{model.name}</h3>
                  <p className="text-sm text-gray-700 dark:text-gray-300">
                    {model.description || "No description available"}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Capabilities Tab */}
        <TabsContent value="capabilities" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Context Window</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {models.map((model) => (
                  <div key={`${model.id}-context-bar`} className="space-y-2">
                    <div className="flex justify-between">
                      <span className="font-medium">{model.name}</span>
                      <span className="text-sm text-gray-500">{formatTokenCount(model.context_length)} tokens</span>
                    </div>
                    <Progress value={(model.context_length / maxContextLength) * 100} className="h-2" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Features Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-100 dark:bg-gray-800/30">
                    <TableHead className="w-1/4">Feature</TableHead>
                    {models.map((model) => (
                      <TableHead key={model.id}>
                        {model.name}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Text Input</TableCell>
                    {models.map((model) => (
                      <TableCell key={`${model.id}-text-input`}>
                        {model.architecture.input_modalities.includes("text") ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <X className="h-5 w-5 text-red-500" />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Image Input</TableCell>
                    {models.map((model) => (
                      <TableCell key={`${model.id}-image-input`}>
                        {model.architecture.input_modalities.includes("image") ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <X className="h-5 w-5 text-red-500" />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Text Output</TableCell>
                    {models.map((model) => (
                      <TableCell key={`${model.id}-text-output`}>
                        {model.architecture.output_modalities.includes("text") ? (
                          <CheckCircle className="h-5 w-5 text-green-500" />
                        ) : (
                          <X className="h-5 w-5 text-red-500" />
                        )}
                      </TableCell>
                    ))}
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Pricing Tab */}
        <TabsContent value="pricing" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Price Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow className="bg-gray-100 dark:bg-gray-800/30">
                    <TableHead className="w-1/4">Pricing</TableHead>
                    {models.map((model) => (
                      <TableHead key={model.id}>
                        {model.name}
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Input (per token)</TableCell>
                    {models.map((model) => (
                      <TableCell key={`${model.id}-input-price`} className="font-mono">
                        {formatPrice(model.pricing.prompt)}
                      </TableCell>
                    ))}
                  </TableRow>
                  <TableRow>
                    <TableCell className="font-medium">Output (per token)</TableCell>
                    {models.map((model) => (
                      <TableCell key={`${model.id}-output-price`} className="font-mono">
                        {formatPrice(model.pricing.completion)}
                      </TableCell>
                    ))}
                  </TableRow>
                  {models.some(model => model.pricing.image !== "0") && (
                    <TableRow>
                      <TableCell className="font-medium">Image Processing</TableCell>
                      {models.map((model) => (
                        <TableCell key={`${model.id}-image-price`} className="font-mono">
                          {formatPrice(model.pricing.image)}
                        </TableCell>
                      ))}
                    </TableRow>
                  )}
                  {models.some(model => model.pricing.request !== "0") && (
                    <TableRow>
                      <TableCell className="font-medium">Per Request</TableCell>
                      {models.map((model) => (
                        <TableCell key={`${model.id}-request-price`} className="font-mono">
                          {formatPrice(model.pricing.request)}
                        </TableCell>
                      ))}
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cost Examples</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-8">
                <div>
                  <h3 className="text-lg font-medium mb-4">Cost for 1,000 input tokens and 500 output tokens</h3>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-100 dark:bg-gray-800/30">
                        <TableHead className="w-1/4">Cost Breakdown</TableHead>
                        {models.map((model) => (
                          <TableHead key={model.id}>
                            {model.name}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Input Cost (1,000 tokens)</TableCell>
                        {models.map((model) => (
                          <TableCell key={`${model.id}-1k-input`} className="font-mono">
                            {formatPrice((parseFloat(model.pricing.prompt) * 1000).toString())}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Output Cost (500 tokens)</TableCell>
                        {models.map((model) => (
                          <TableCell key={`${model.id}-500-output`} className="font-mono">
                            {formatPrice((parseFloat(model.pricing.completion) * 500).toString())}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-gray-50 dark:bg-gray-800/10 font-medium">
                        <TableCell>Total Cost</TableCell>
                        {models.map((model) => {
                          const totalCost = parseFloat(model.pricing.prompt) * 1000 + parseFloat(model.pricing.completion) * 500;
                          return (
                            <TableCell key={`${model.id}-1k-500-total`} className="font-mono">
                              {formatPrice(totalCost.toString())}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-4">Cost for 10,000 input tokens and 2,000 output tokens</h3>
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-100 dark:bg-gray-800/30">
                        <TableHead className="w-1/4">Cost Breakdown</TableHead>
                        {models.map((model) => (
                          <TableHead key={model.id}>
                            {model.name}
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      <TableRow>
                        <TableCell className="font-medium">Input Cost (10,000 tokens)</TableCell>
                        {models.map((model) => (
                          <TableCell key={`${model.id}-10k-input`} className="font-mono">
                            {formatPrice((parseFloat(model.pricing.prompt) * 10000).toString())}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-medium">Output Cost (2,000 tokens)</TableCell>
                        {models.map((model) => (
                          <TableCell key={`${model.id}-2k-output`} className="font-mono">
                            {formatPrice((parseFloat(model.pricing.completion) * 2000).toString())}
                          </TableCell>
                        ))}
                      </TableRow>
                      <TableRow className="bg-gray-50 dark:bg-gray-800/10 font-medium">
                        <TableCell>Total Cost</TableCell>
                        {models.map((model) => {
                          const totalCost = parseFloat(model.pricing.prompt) * 10000 + parseFloat(model.pricing.completion) * 2000;
                          return (
                            <TableCell key={`${model.id}-10k-2k-total`} className="font-mono">
                              {formatPrice(totalCost.toString())}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ModelComparison;