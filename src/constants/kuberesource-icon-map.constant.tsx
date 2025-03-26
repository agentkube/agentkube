import nodeIcon from '@/assets/resources/png/infrastructure_components/labeled/node-128.png';
import podIcon from '@/assets/resources/png/resources/labeled/pod-128.png';
import deploymentIcon from '@/assets/resources/png/resources/labeled/deploy-128.png';
import daemonsetIcon from '@/assets/resources/png/resources/labeled/ds-128.png';
import statefulsetIcon from '@/assets/resources/png/resources/labeled/sts-128.png';
import replicasetIcon from '@/assets/resources/png/resources/labeled/rs-128.png';
import replicationControllerIcon from '@/assets/resources/png/resources/unlabeled/pod-128.png';
import jobIcon from '@/assets/resources/png/resources/labeled/job-128.png';
import cronjobIcon from '@/assets/resources/png/resources/labeled/cronjob-128.png';
import configMapIcon from '@/assets/resources/png/resources/labeled/cm-128.png';
import secretIcon from '@/assets/resources/png/resources/labeled/secret-128.png';
import quotaIcon from '@/assets/resources/png/resources/labeled/quota-128.png';
import limitsIcon from '@/assets/resources/png/resources/labeled/limits-128.png';
import hpaIcon from '@/assets/resources/png/resources/labeled/hpa-128.png';
import defaultPodIcon from '@/assets/resources/png/resources/unlabeled/pod-128.png';
import serviceIcon from '@/assets/resources/png/resources/labeled/svc-128.png';
import endpointIcon from '@/assets/resources/png/resources/labeled/ep-128.png';
import ingressIcon from '@/assets/resources/png/resources/labeled/ing-128.png';
import netpolIcon from '@/assets/resources/png/resources/labeled/netpol-128.png';
import pvcIcon from '@/assets/resources/png/resources/labeled/pvc-128.png';
import pvIcon from '@/assets/resources/png/resources/labeled/pv-128.png';
import scIcon from '@/assets/resources/png/resources/labeled/sc-128.png';
import namespaceIcon from '@/assets/resources/png/resources/labeled/ns-128.png';
import serviceAccountIcon from '@/assets/resources/png/resources/labeled/sa-128.png';
import clusterRoleIcon from '@/assets/resources/png/resources/labeled/c-role-128.png';
import roleIcon from '@/assets/resources/png/resources/labeled/role-128.png';
import clusterRoleBindingIcon from '@/assets/resources/png/resources/labeled/crb-128.png';
import roleBindingIcon from '@/assets/resources/png/resources/labeled/rb-128.png';
import crdIcon from '@/assets/resources/png/resources/labeled/crd-128.png';
import internetIcon from '@/assets/resources/internet.png';

export const KubeResourceIconMap = {
  nodes: nodeIcon,
  pods: podIcon,
  deployments: deploymentIcon,
  daemonsets: daemonsetIcon,
  statefulsets: statefulsetIcon,
  replicasets: replicasetIcon,
  'replication-controllers': replicationControllerIcon,
  jobs: jobIcon,
  cronjobs: cronjobIcon,
  'configmaps': configMapIcon,
  secrets: secretIcon,
  'resourcequotas': quotaIcon,
  'limitranges': limitsIcon,
  hpa: hpaIcon,
  vpa: defaultPodIcon,
  pdb: defaultPodIcon,
  'priorityclasses': defaultPodIcon,
  'runtime-classes': defaultPodIcon,
  leases: defaultPodIcon,
  'mutating-webhook': defaultPodIcon,
  'validating-webhook': defaultPodIcon,
  services: serviceIcon,
  endpoints: endpointIcon,
  ingresses: ingressIcon,
  'ingressclasses': ingressIcon,
  'networkpolicies': netpolIcon,
  'persistentvolumeclaims': pvcIcon,
  'persistentvolumes': pvIcon,
  'storageclasses': scIcon,
  namespaces: namespaceIcon,
  events: defaultPodIcon,
  charts: defaultPodIcon,
  releases: defaultPodIcon,
  'serviceaccounts': serviceAccountIcon,
  'clusterroles': clusterRoleIcon,
  roles: roleIcon,
  'clusterrolebindings': clusterRoleBindingIcon,
  'rolebindings': roleBindingIcon,
  'customresources': crdIcon,
  internet: internetIcon,
  default: crdIcon,
} as const;

export type KubeResourceType = keyof typeof KubeResourceIconMap;