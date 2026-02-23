import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Calendar,
  Clock,
  Code,
  Database,
  Eye,
  Image,
  Info,
  MessageSquare,
  Zap,
  ArrowUpDown,
  PenTool,
  BookOpen,
  ArrowRight,
  DollarSign,
  Copy,
  Check,
  Plus
} from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle
} from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from '@/hooks/use-toast';
import { useModels } from '@/contexts/useModel';

// Define types for model data
interface ModelArchitecture {
  modality: string;
  input_modalities: string[];
  output_modalities: string[];
  tokenizer: string;
  instruct_type: string | null;
}

interface ProviderInfo {
  context_length: number | null;
  max_completion_tokens: number | null;
  is_moderated: boolean;
}

interface ModelPricing {
  prompt: string;
  completion: string;
  request: string;
  image: string;
  web_search: string;
  internal_reasoning: string;
  input_cache_read: string;
  input_cache_write: string;
}

interface ModelData {
  id: string;
  name: string;
  created: number;
  description: string;
  context_length: number;
  architecture: ModelArchitecture;
  pricing: ModelPricing;
  top_provider: ProviderInfo;
  per_request_limits: any;
}

interface ModelViewDialogProps {
  model: ModelData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const ModelViewDialog: React.FC<ModelViewDialogProps> = ({
  model,
  open,
  onOpenChange
}) => {
  const [activeTab, setActiveTab] = useState("overview");
  const [copied, setCopied] = useState(false);
  const [isAddingModel, setIsAddingModel] = useState(false);
  const { enableModel } = useModels();

  if (!model) return null;

  // Format date from timestamp
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp * 1000);
    return date.toLocaleDateString("en-US", {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  };

  // Format pricing display
  const formatPrice = (price: string) => {
    if (price === "-1") return "Variable";
    if (price === "0") return "Free";

    const priceNum = parseFloat(price);

    if (priceNum === 0) return "$0.00";
    if (priceNum < 0.000001) return `$${(priceNum * 1000000).toFixed(4)}µ`;
    if (priceNum < 0.001) return `$${(priceNum * 1000).toFixed(4)}m`;

    return `$${priceNum.toFixed(6)}`;
  };

  // Format model context token count
  const formatTokenCount = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(0)}K`;
    return count.toString();
  };

  // Get a badge color for modality type
  const getModalityColor = (modality: string) => {
    switch (modality) {
      case "text->text":
        return "bg-blue-100 text-blue-800";
      case "text+image->text":
        return "bg-purple-100 text-purple-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  // Helper to check if model is multimodal
  const isMultimodal = model.architecture.input_modalities.includes("image");

  // Extract provider from model ID (assumes format like "provider/model-name")
  const getProviderFromId = (modelId: string) => {
    const parts = modelId.split('/');
    return parts.length > 1 ? parts[0] : 'custom';
  };

  // Extract model name from model ID (assumes format like "provider/model-name")
  const getModelNameFromId = (modelId: string) => {
    const parts = modelId.split('/');
    return parts.length > 1 ? parts[1] : modelId;
  };

  // Handle adding model to user's enabled models
  const handleAddModel = async () => {
    if (isAddingModel) return;

    setIsAddingModel(true);

    try {
      const providerId = getProviderFromId(model.id);
      const modelName = getModelNameFromId(model.id);

      await enableModel(providerId, modelName);

      toast({
        title: "Model Enabled",
        description: `${modelName} has been added to your enabled models.`,
        duration: 3000,
      });

      // Optionally close the dialog after successful addition
      onOpenChange(false);
    } catch (error) {
      console.error('Error enabling model:', error);
      toast({
        title: "Error",
        description: "Failed to enable model. Please try again.",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setIsAddingModel(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto bg-card backdrop-blur-lg [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-gray-700/30 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
        <DialogHeader>
          <div className="flex items-center">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-2xl font-bold">{model.name}</DialogTitle>
              {isMultimodal && (
                <Badge
                  className="bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white"
                >
                  Multimodal
                </Badge>
              )}
            </div>
          </div>
          <div className="flex items-center justify-between gap-2 py-2">
            <div className="text-xs p-1 border border-border rounded-md font-mono flex items-center gap-1">
              {model.id}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  navigator.clipboard.writeText(model.id);
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                }}
                className="ml-1 p-0.5 hover:bg-accent rounded-md transition-colors"
              >
                {copied ? (
                  <Check className="h-4 w-4 text-green-500" />
                ) : (
                  <Copy className="h-4 w-4 text-gray-500" />
                )}
              </button>
            </div>

            <button
              onClick={handleAddModel}
              disabled={isAddingModel}
              className={`flex border border-border p-1.5 hover:bg-accent transition-all rounded-md items-center text-xs ${isAddingModel ? 'opacity-50 cursor-not-allowed' : ''
                }`}
            >
              <Plus className='h-4 w-4' />
              <span>{isAddingModel ? 'Adding...' : 'Add Model'}</span>
            </button>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="h-4 w-4" />
            <span>Released {formatDate(model.created)}</span>
          </div>
        </DialogHeader>

        <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid grid-cols-3 mb-4">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="details">Technical Details</TabsTrigger>
            <TabsTrigger value="pricing">Pricing</TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <div className="text-sm prose prose-invert max-w-none prose-sm text-muted-foreground">
              <p>{model.description}</p>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Database className="h-4 w-4" />
                    Context Window
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{formatTokenCount(model.context_length)}</div>
                  <p className="text-sm text-gray-500 dark:text-gray-400">tokens</p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Zap className="h-4 w-4" />
                    Architecture
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Badge className={getModalityColor(model.architecture.modality)}>
                    {model.architecture.modality}
                  </Badge>
                  {model.architecture.tokenizer && (
                    <div className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                      Tokenizer: {model.architecture.tokenizer}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <PenTool className="h-4 w-4" />
                  Input Modalities
                </CardTitle>
              </CardHeader>
              <CardContent className="flex gap-2">
                {model.architecture.input_modalities.map((modality) => (
                  <Badge key={modality} variant="outline" className="flex items-center gap-1">
                    {modality === "text" ? <MessageSquare className="h-3 w-3" /> : <Image className="h-3 w-3" />}
                    {modality}
                  </Badge>
                ))}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Pricing Overview
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-sm">Input</span>
                  <span className="font-mono">{formatPrice(model.pricing.prompt)}/token</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm">Output</span>
                  <span className="font-mono">{formatPrice(model.pricing.completion)}/token</span>
                </div>
                {model.pricing.image !== "0" && (
                  <div className="flex justify-between">
                    <span className="text-sm">Image Processing</span>
                    <span className="font-mono">{formatPrice(model.pricing.image)}/image</span>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="details" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Technical Specifications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <h4 className="text-sm font-medium mb-1">Tokenizer</h4>
                    <p className="text-sm">{model.architecture.tokenizer || "Not specified"}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-1">Instruction Type</h4>
                    <p className="text-sm">{model.architecture.instruct_type || "Not specified"}</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-1">Context Length</h4>
                    <p className="text-sm">{model.context_length.toLocaleString()} tokens</p>
                  </div>

                  <div>
                    <h4 className="text-sm font-medium mb-1">Max Completion</h4>
                    <p className="text-sm">
                      {model.top_provider.max_completion_tokens
                        ? `${model.top_provider.max_completion_tokens.toLocaleString()} tokens`
                        : "Not specified"}
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-1">Moderation</h4>
                  <Badge variant={model.top_provider.is_moderated ? "destructive" : "default"}>
                    {model.top_provider.is_moderated ? "Moderated" : "Unmoderated"}
                  </Badge>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2">Input Modalities</h4>
                  <div className="flex gap-2">
                    {model.architecture.input_modalities.map((modality) => (
                      <Badge key={modality} variant="outline" className="flex items-center gap-1">
                        {modality === "text" ? <MessageSquare className="h-3 w-3" /> : <Image className="h-3 w-3" />}
                        {modality}
                      </Badge>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-medium mb-2">Output Modalities</h4>
                  <div className="flex gap-2">
                    {model.architecture.output_modalities.map((modality) => (
                      <Badge key={modality} variant="outline" className="flex items-center gap-1">
                        {modality === "text" ? <MessageSquare className="h-3 w-3" /> : <Image className="h-3 w-3" />}
                        {modality}
                      </Badge>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Performance Metrics</CardTitle>
                <CardDescription>Model capabilities comparison</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between">
                      <span className="text-sm">Context Size</span>
                      <span className="text-xs text-gray-500">{formatTokenCount(model.context_length)} tokens</span>
                    </div>
                    <Progress value={(model.context_length / 2000000) * 100} className="h-2 mt-1" />
                  </div>

                  <div>
                    <div className="flex justify-between">
                      <span className="text-sm">Multimodal Capabilities</span>
                      <span className="text-xs text-gray-500">
                        {isMultimodal ? "Supported" : "Not supported"}
                      </span>
                    </div>
                    <Progress value={isMultimodal ? 100 : 0} className="h-2 mt-1" />
                  </div>

                  <div>
                    <div className="flex justify-between">
                      <span className="text-sm">Cost Efficiency</span>
                      <span className="text-xs text-gray-500">
                        {model.pricing.prompt === "0" ? "Free" : "Paid"}
                      </span>
                    </div>
                    <Progress
                      value={model.pricing.prompt === "0" ? 100 :
                        parseFloat(model.pricing.prompt) < 0.000001 ? 80 :
                          parseFloat(model.pricing.prompt) < 0.00001 ? 60 :
                            parseFloat(model.pricing.prompt) < 0.0001 ? 40 : 20}
                      className="h-2 mt-1"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="pricing" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Token Pricing</CardTitle>
                <CardDescription>Cost per token for model usage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div className="flex justify-between col-span-2 font-medium border-b pb-2">
                      <span>Category</span>
                      <span>Price per Unit</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-sm">Input (Prompt)</span>
                      <span className="font-mono text-sm">{formatPrice(model.pricing.prompt)}</span>
                    </div>

                    <div className="flex justify-between">
                      <span className="text-sm">Output (Completion)</span>
                      <span className="font-mono text-sm">{formatPrice(model.pricing.completion)}</span>
                    </div>

                    {model.pricing.image !== "0" && (
                      <div className="flex justify-between">
                        <span className="text-sm">Image Processing</span>
                        <span className="font-mono text-sm">{formatPrice(model.pricing.image)}</span>
                      </div>
                    )}

                    {model.pricing.request !== "0" && (
                      <div className="flex justify-between">
                        <span className="text-sm">Per Request</span>
                        <span className="font-mono text-sm">{formatPrice(model.pricing.request)}</span>
                      </div>
                    )}

                    {model.pricing.web_search !== "0" && (
                      <div className="flex justify-between">
                        <span className="text-sm">Web Search</span>
                        <span className="font-mono text-sm">{formatPrice(model.pricing.web_search)}</span>
                      </div>
                    )}

                    {model.pricing.internal_reasoning !== "0" && (
                      <div className="flex justify-between">
                        <span className="text-sm">Internal Reasoning</span>
                        <span className="font-mono text-sm">{formatPrice(model.pricing.internal_reasoning)}</span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cost Examples</CardTitle>
                <CardDescription>Estimated costs for typical usage</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {model.pricing.prompt !== "0" && model.pricing.prompt !== "-1" && (
                    <>
                      <div>
                        <h4 className="text-sm font-medium mb-2">1,000 tokens input / 500 tokens output</h4>
                        <div className="text-sm grid grid-cols-2 gap-2">
                          <div>Input cost: <span className="font-mono">{formatPrice((parseFloat(model.pricing.prompt) * 1000).toString())}</span></div>
                          <div>Output cost: <span className="font-mono">{formatPrice((parseFloat(model.pricing.completion) * 500).toString())}</span></div>
                          <div className="col-span-2 pt-1 border-t">
                            Total: <span className="font-mono">{formatPrice((parseFloat(model.pricing.prompt) * 1000 + parseFloat(model.pricing.completion) * 500).toString())}</span>
                          </div>
                        </div>
                      </div>

                      <div>
                        <h4 className="text-sm font-medium mb-2">10,000 tokens input / 2,000 tokens output</h4>
                        <div className="text-sm grid grid-cols-2 gap-2">
                          <div>Input cost: <span className="font-mono">{formatPrice((parseFloat(model.pricing.prompt) * 10000).toString())}</span></div>
                          <div>Output cost: <span className="font-mono">{formatPrice((parseFloat(model.pricing.completion) * 2000).toString())}</span></div>
                          <div className="col-span-2 pt-1 border-t">
                            Total: <span className="font-mono">{formatPrice((parseFloat(model.pricing.prompt) * 10000 + parseFloat(model.pricing.completion) * 2000).toString())}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  )}

                  {(model.pricing.prompt === "0" || model.pricing.completion === "0") && (
                    <div className="py-2">
                      <Badge variant="default" className="bg-green-100 text-green-800">
                        Free Tier Available
                      </Badge>
                      <p className="mt-2 text-sm">This model offers free usage tier.</p>
                    </div>
                  )}

                  {model.pricing.prompt === "-1" && (
                    <div className="py-2">
                      <Badge variant="outline">Variable Pricing</Badge>
                      <p className="mt-2 text-sm">This model uses variable pricing depending on which model is selected.</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog >
  );
};

export default ModelViewDialog;