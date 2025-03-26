import { V1HorizontalPodAutoscaler, V1HorizontalPodAutoscalerSpec, V1HorizontalPodAutoscalerStatus } from '@kubernetes/client-node';

// Extended spec to include metrics and behavior
export interface V1HorizontalPodAutoscalerSpecExtended extends V1HorizontalPodAutoscalerSpec {
  metrics?: V1MetricSpec[];
  behavior?: V1HorizontalPodAutoscalerBehavior;
}

// Extended status to include conditions and currentMetrics
export interface V1HorizontalPodAutoscalerStatusExtended extends V1HorizontalPodAutoscalerStatus {
  conditions?: V1HorizontalPodAutoscalerCondition[];
  currentMetrics?: V1MetricStatus[];
}

// Extended HPA to use our extended spec and status
export interface V1HorizontalPodAutoscalerExtended extends V1HorizontalPodAutoscaler {
  spec?: V1HorizontalPodAutoscalerSpecExtended;
  status?: V1HorizontalPodAutoscalerStatusExtended;
}

// Interfaces for the missing types
export interface V1MetricSpec {
  type: string;
  resource?: V1ResourceMetricSource;
  pods?: V1PodsMetricSource;
  object?: V1ObjectMetricSource;
  external?: V1ExternalMetricSource;
}

export interface V1ResourceMetricSource {
  name: string;
  target?: V1MetricTarget;
}

export interface V1MetricTarget {
  type: string;
  averageUtilization?: number;
  averageValue?: string;
  value?: string;
}

export interface V1PodsMetricSource {
  metric: V1MetricIdentifier;
  target: V1MetricTarget;
}

export interface V1ObjectMetricSource {
  metric: V1MetricIdentifier;
  describedObject: V1CrossVersionObjectReference;
  target: V1MetricTarget;
}

export interface V1ExternalMetricSource {
  metric: V1MetricIdentifier;
  target: V1MetricTarget;
}

export interface V1MetricIdentifier {
  name: string;
  selector?: V1LabelSelector;
}

export interface V1CrossVersionObjectReference {
  kind: string;
  name: string;
  apiVersion?: string;
}

export interface V1LabelSelector {
  matchLabels?: {[key: string]: string};
  matchExpressions?: V1LabelSelectorRequirement[];
}

export interface V1LabelSelectorRequirement {
  key: string;
  operator: string;
  values?: string[];
}

export interface V1MetricStatus {
  type: string;
  resource?: V1ResourceMetricStatus;
  pods?: V1PodsMetricStatus;
  object?: V1ObjectMetricStatus;
  external?: V1ExternalMetricStatus;
}

export interface V1ResourceMetricStatus {
  name: string;
  current?: V1MetricValueStatus;
}

export interface V1MetricValueStatus {
  averageUtilization?: number;
  averageValue?: string;
  value?: string;
}

export interface V1PodsMetricStatus {
  metric: V1MetricIdentifier;
  current: V1MetricValueStatus;
}

export interface V1ObjectMetricStatus {
  metric: V1MetricIdentifier;
  describedObject: V1CrossVersionObjectReference;
  current: V1MetricValueStatus;
}

export interface V1ExternalMetricStatus {
  metric: V1MetricIdentifier;
  current: V1MetricValueStatus;
}

export interface V1HorizontalPodAutoscalerCondition {
  type: string;
  status: string;
  lastTransitionTime: string;
  reason?: string;
  message?: string;
}

export interface V1HorizontalPodAutoscalerBehavior {
  scaleUp?: V1ScalingRules;
  scaleDown?: V1ScalingRules;
}

export interface V1ScalingRules {
  stabilizationWindowSeconds?: number;
  selectPolicy?: string;
  policies?: V1ScalingPolicy[];
}

export interface V1ScalingPolicy {
  type: string;
  value: number;
  periodSeconds: number;
}