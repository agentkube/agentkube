import React, { useState, useEffect } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, Search, Folder, Plus } from "lucide-react";
import { toast } from '@/hooks/use-toast';
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { TEMPLATE_CATEGORIES, GITHUB_BASE_URL, TemplateCategory, TemplateItem } from '@/constants/templates.constant';

interface ResourceTemplateProps {
  onSelectTemplate: (content: string, name: string, resourceType?: string) => void;
}

const ResourceTemplate: React.FC<ResourceTemplateProps> = ({ onSelectTemplate }) => {
  const [loading, setLoading] = useState(false);
  const [templateCategories, setTemplateCategories] = useState<TemplateCategory[]>(TEMPLATE_CATEGORIES);
  const [searchQuery, setSearchQuery] = useState("");
  const [filteredCategories, setFilteredCategories] = useState<TemplateCategory[]>(TEMPLATE_CATEGORIES);

  // Apply search filter
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredCategories(templateCategories);
      return;
    }

    const query = searchQuery.toLowerCase();

    const filtered = templateCategories.map(category => {
      // Filter items in each category
      const filteredItems = category.items.filter(item =>
        item.name.toLowerCase().includes(query) ||
        item.description.toLowerCase().includes(query)
      );

      // Return category with filtered items
      return {
        ...category,
        items: filteredItems
      };
    }).filter(category => category.items.length > 0);

    setFilteredCategories(filtered);
  }, [searchQuery, templateCategories]);

  // Function to fetch and apply template directly
  const applyTemplate = async (template: TemplateItem) => {
    // Show loading toast
    const loadingToast = toast({
      title: "Loading Template",
      description: `Fetching ${template.name}...`,
      variant: "default"
    });

    try {
      const response = await fetch(`${GITHUB_BASE_URL}/${template.path}`);

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const content = await response.text();

      // Apply the template
      onSelectTemplate(content, template.name, template.resourceType);

      // Show success toast
      toast({
        title: "Template Applied",
        description: `${template.name} template applied to editor`,
        variant: "success"
      });
    } catch (error) {
      console.error(`Error fetching template content for ${template.path}:`, error);
      toast({
        title: "Error",
        description: `Failed to load template: ${error instanceof Error ? error.message : String(error)}`,
        variant: "destructive"
      });
    } finally {
      // Dismiss loading toast
      // toast.dismiss(loadingToast);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8 h-full">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="p-4 space-y-4 h-full flex flex-col">
      {/* Search Bar */}
      <div className="relative w-full">
        <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search templates..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      {/* Accordion Categories */}
      <ScrollArea className="flex-1">
        {filteredCategories.length > 0 ? (
          <Accordion type="multiple" defaultValue={["workloads"]} className="w-full">
            {filteredCategories.map((category) => (
              <AccordionItem key={category.name} value={category.name}>
                <AccordionTrigger className="hover:bg-accent/20 px-2 hover:no-underline">
                  <div className="flex items-center">
                    <Folder className="h-4 w-4 mr-2 text-accent" />
                    <span>{category.displayName}</span>
                    <span className="ml-2 text-xs text-muted-foreground">
                      ({category.items.length})
                    </span>
                  </div>
                </AccordionTrigger>
                <AccordionContent>
                  <div className="space-y-1 pl-6">
                    {category.items.map((template) => (
                      <Button
                        key={template.path}
                        variant="ghost"
                        className="w-full justify-start text-left h-auto py-2 flex items-start gap-2 hover:bg-accent/20"
                        onClick={() => applyTemplate(template)}
                      >
                        {template.icon ? (
                          <div className=" flex-shrink-0">
                            <img
                              src={template.icon}
                              alt={template.name}
                              width={30}
                              height={30}
                              className="object-contain"
                            />
                          </div>
                        ) : (
                          <Folder className="h-4 w-4 mt-0.5 text-accent flex-shrink-0" />
                        )}
                        <div>
                          <div className="font-medium">{template.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {template.description}
                          </div>
                        </div>
                      </Button>
                    ))}
                  </div>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <div className="p-4 text-center text-muted-foreground">
            No templates found matching "{searchQuery}"
          </div>
        )}
      </ScrollArea>

      {/* Custom Template Button */}
      {/* <Button variant="outline" className="w-full">
        <Plus className="h-4 w-4 mr-2" /> Create Custom Template
      </Button> */}
    </div>
  );
};

export default ResourceTemplate;