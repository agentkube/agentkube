import React from 'react';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb";
import { ChevronRight } from "lucide-react";

interface PathItem {
  label: string;
  href?: string;
}

interface BreadcrumbNavigationProps {
  paths: PathItem[];
}

const BreadcrumbNavigation = ({ paths }: BreadcrumbNavigationProps) => {
  return (
    <Breadcrumb className="p-4">
      <BreadcrumbList>
        <BreadcrumbItem>
          <BreadcrumbLink href="/" className="flex items-center">
            {/* <Home className="h-4 w-4 mr-1" /> */}
            Dashboard
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator>
          <ChevronRight className="h-4 w-4" />
        </BreadcrumbSeparator>
        
        {paths.map((path, index) => (
          <React.Fragment key={index}>
            <BreadcrumbItem>
              {index === paths.length - 1 ? (
                <BreadcrumbPage>{path.label}</BreadcrumbPage>
              ) : (
                <BreadcrumbLink href={path.href || '#'}>
                  {path.label}
                </BreadcrumbLink>
              )}
            </BreadcrumbItem>
            {index < paths.length - 1 && (
              <BreadcrumbSeparator>
                <ChevronRight className="h-4 w-4" />
              </BreadcrumbSeparator>
            )}
          </React.Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  );
};

export default BreadcrumbNavigation;