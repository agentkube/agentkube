export interface PricingPlan {
  id: string;
  name: string;
  price: string | number;
  interval: string;
  description: string;
  features: string[];
}