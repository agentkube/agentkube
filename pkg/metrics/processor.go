package metrics

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/agentkube/operator/pkg/logger"
	"github.com/agentkube/operator/pkg/utils"
	appsv1 "k8s.io/api/apps/v1"
	corev1 "k8s.io/api/core/v1"
	rbacv1 "k8s.io/api/rbac/v1"
	"k8s.io/apimachinery/pkg/api/errors"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/apis/meta/v1/unstructured"
	"k8s.io/apimachinery/pkg/runtime/schema"
	"k8s.io/apimachinery/pkg/util/intstr"
	"k8s.io/apimachinery/pkg/util/wait"
	"k8s.io/client-go/dynamic"
	"k8s.io/client-go/kubernetes"
	"k8s.io/client-go/rest"
)

// MetricsProcessor handles the actual installation/uninstallation of metrics server
type MetricsProcessor struct {
	manager *MetricsServerManager
}

// NewMetricsProcessor creates a new metrics processor
func NewMetricsProcessor(manager *MetricsServerManager) *MetricsProcessor {
	return &MetricsProcessor{
		manager: manager,
	}
}

// ProcessOperation processes metrics server operations
func (p *MetricsProcessor) ProcessOperation(op *utils.Operation) error {
	switch op.Type {
	case "metrics-install":
		return p.processInstall(op)
	case "metrics-uninstall":
		return p.processUninstall(op)
	default:
		return fmt.Errorf("unsupported operation type: %s", op.Type)
	}
}

// CanProcess returns true if this processor can handle the operation type
func (p *MetricsProcessor) CanProcess(operationType string) bool {
	return operationType == "metrics-install" || operationType == "metrics-uninstall"
}

// processInstall handles the installation of metrics server
func (p *MetricsProcessor) processInstall(op *utils.Operation) error {
	clusterName := op.Target
	installType := "production" // default

	if op.Data != nil {
		if t, ok := op.Data["installType"].(string); ok {
			installType = t
		}
	}

	logger.Log(logger.LevelInfo, map[string]string{
		"cluster":     clusterName,
		"type":        installType,
		"operationId": op.ID,
	}, nil, "Starting metrics server installation")

	// Update progress
	p.manager.queue.UpdateOperation(op.ID, utils.StatusRunning, 10, "Creating Kubernetes clients", nil)

	// Get clients
	clientset, restConfig, err := p.manager.getKubernetesClients(clusterName)
	if err != nil {
		return fmt.Errorf("failed to create kubernetes clients: %w", err)
	}

	// Install components step by step
	steps := []struct {
		name     string
		progress int
		fn       func() error
	}{
		{"Creating ServiceAccount", 20, func() error { return p.createServiceAccount(clientset) }},
		{"Creating ClusterRoles", 30, func() error { return p.createClusterRoles(clientset) }},
		{"Creating RoleBinding", 40, func() error { return p.createRoleBinding(clientset) }},
		{"Creating ClusterRoleBindings", 50, func() error { return p.createClusterRoleBindings(clientset) }},
		{"Creating Service", 60, func() error { return p.createService(clientset) }},
		{"Creating Deployment", 70, func() error { return p.createDeployment(clientset, installType) }},
		{"Creating APIService", 80, func() error { return p.createAPIService(restConfig) }},
		{"Verifying installation", 90, func() error { return p.verifyInstallation(clientset) }},
	}

	for _, step := range steps {
		p.manager.queue.UpdateOperation(op.ID, utils.StatusRunning, step.progress, step.name, nil)
		if err := step.fn(); err != nil {
			return fmt.Errorf("failed at step '%s': %w", step.name, err)
		}
	}

	p.manager.queue.UpdateOperation(op.ID, utils.StatusCompleted, 100, "Metrics server installation completed successfully", nil)

	logger.Log(logger.LevelInfo, map[string]string{
		"cluster":     clusterName,
		"operationId": op.ID,
	}, nil, "Metrics server installation completed")

	return nil
}

// processUninstall handles the uninstallation of metrics server
func (p *MetricsProcessor) processUninstall(op *utils.Operation) error {
	clusterName := op.Target

	logger.Log(logger.LevelInfo, map[string]string{
		"cluster":     clusterName,
		"operationId": op.ID,
	}, nil, "Starting metrics server uninstallation")

	// Update progress
	p.manager.queue.UpdateOperation(op.ID, utils.StatusRunning, 10, "Creating Kubernetes clients", nil)

	// Get clients
	clientset, restConfig, err := p.manager.getKubernetesClients(clusterName)
	if err != nil {
		return fmt.Errorf("failed to create kubernetes clients: %w", err)
	}

	// Uninstall components in reverse order
	steps := []struct {
		name     string
		progress int
		fn       func() error
	}{
		{"Deleting Deployment", 20, func() error { return p.deleteDeployment(clientset) }},
		{"Deleting APIService", 25, func() error { return p.deleteAPIService(restConfig) }},
		{"Deleting Service", 30, func() error { return p.deleteService(clientset) }},
		{"Deleting ClusterRoleBindings", 40, func() error { return p.deleteClusterRoleBindings(clientset) }},
		{"Deleting RoleBinding", 50, func() error { return p.deleteRoleBinding(clientset) }},
		{"Deleting ClusterRoles", 60, func() error { return p.deleteClusterRoles(clientset) }},
		{"Deleting ServiceAccount", 70, func() error { return p.deleteServiceAccount(clientset) }},
		{"Verifying uninstallation", 90, func() error { return p.verifyUninstallation(clientset) }},
	}

	for _, step := range steps {
		p.manager.queue.UpdateOperation(op.ID, utils.StatusRunning, step.progress, step.name, nil)
		if err := step.fn(); err != nil {
			// Log warning but continue with other steps
			logger.Log(logger.LevelWarn, map[string]string{
				"cluster": clusterName,
				"step":    step.name,
			}, err, "Failed to delete component during uninstallation")
		}
	}

	p.manager.queue.UpdateOperation(op.ID, utils.StatusCompleted, 100, "Metrics server uninstallation completed", nil)

	logger.Log(logger.LevelInfo, map[string]string{
		"cluster":     clusterName,
		"operationId": op.ID,
	}, nil, "Metrics server uninstallation completed")

	return nil
}

// createServiceAccount creates the metrics server service account
func (p *MetricsProcessor) createServiceAccount(clientset *kubernetes.Clientset) error {
	sa := &corev1.ServiceAccount{
		ObjectMeta: metav1.ObjectMeta{
			Name:      MetricsServerName,
			Namespace: MetricsServerNamespace,
			Labels: map[string]string{
				ComponentLabel: ComponentValue,
			},
		},
	}

	_, err := clientset.CoreV1().ServiceAccounts(MetricsServerNamespace).Create(
		context.Background(), sa, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return err
	}
	return nil
}

// createClusterRoles creates the required cluster roles
func (p *MetricsProcessor) createClusterRoles(clientset *kubernetes.Clientset) error {
	// Create system:aggregated-metrics-reader
	aggregatedRole := &rbacv1.ClusterRole{
		ObjectMeta: metav1.ObjectMeta{
			Name: "system:aggregated-metrics-reader",
			Labels: map[string]string{
				ComponentLabel: ComponentValue,
				"rbac.authorization.k8s.io/aggregate-to-admin": "true",
				"rbac.authorization.k8s.io/aggregate-to-edit":  "true",
				"rbac.authorization.k8s.io/aggregate-to-view":  "true",
			},
		},
		Rules: []rbacv1.PolicyRule{
			{
				APIGroups: []string{"metrics.k8s.io"},
				Resources: []string{"pods", "nodes"},
				Verbs:     []string{"get", "list", "watch"},
			},
		},
	}

	_, err := clientset.RbacV1().ClusterRoles().Create(
		context.Background(), aggregatedRole, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return err
	}

	// Create system:metrics-server
	metricsRole := &rbacv1.ClusterRole{
		ObjectMeta: metav1.ObjectMeta{
			Name: "system:metrics-server",
			Labels: map[string]string{
				ComponentLabel: ComponentValue,
			},
		},
		Rules: []rbacv1.PolicyRule{
			{
				APIGroups: []string{""},
				Resources: []string{"nodes/metrics"},
				Verbs:     []string{"get"},
			},
			{
				APIGroups: []string{""},
				Resources: []string{"pods", "nodes"},
				Verbs:     []string{"get", "list", "watch"},
			},
		},
	}

	_, err = clientset.RbacV1().ClusterRoles().Create(
		context.Background(), metricsRole, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return err
	}

	return nil
}

// createRoleBinding creates the role binding for auth reader
func (p *MetricsProcessor) createRoleBinding(clientset *kubernetes.Clientset) error {
	rb := &rbacv1.RoleBinding{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "metrics-server-auth-reader",
			Namespace: MetricsServerNamespace,
			Labels: map[string]string{
				ComponentLabel: ComponentValue,
			},
		},
		RoleRef: rbacv1.RoleRef{
			APIGroup: "rbac.authorization.k8s.io",
			Kind:     "Role",
			Name:     "extension-apiserver-authentication-reader",
		},
		Subjects: []rbacv1.Subject{
			{
				Kind:      "ServiceAccount",
				Name:      MetricsServerName,
				Namespace: MetricsServerNamespace,
			},
		},
	}

	_, err := clientset.RbacV1().RoleBindings(MetricsServerNamespace).Create(
		context.Background(), rb, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return err
	}
	return nil
}

// createClusterRoleBindings creates the cluster role bindings
func (p *MetricsProcessor) createClusterRoleBindings(clientset *kubernetes.Clientset) error {
	// Create auth-delegator binding
	authDelegator := &rbacv1.ClusterRoleBinding{
		ObjectMeta: metav1.ObjectMeta{
			Name: "metrics-server:system:auth-delegator",
			Labels: map[string]string{
				ComponentLabel: ComponentValue,
			},
		},
		RoleRef: rbacv1.RoleRef{
			APIGroup: "rbac.authorization.k8s.io",
			Kind:     "ClusterRole",
			Name:     "system:auth-delegator",
		},
		Subjects: []rbacv1.Subject{
			{
				Kind:      "ServiceAccount",
				Name:      MetricsServerName,
				Namespace: MetricsServerNamespace,
			},
		},
	}

	_, err := clientset.RbacV1().ClusterRoleBindings().Create(
		context.Background(), authDelegator, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return err
	}

	// Create metrics-server binding
	metricsBinding := &rbacv1.ClusterRoleBinding{
		ObjectMeta: metav1.ObjectMeta{
			Name: "system:metrics-server",
			Labels: map[string]string{
				ComponentLabel: ComponentValue,
			},
		},
		RoleRef: rbacv1.RoleRef{
			APIGroup: "rbac.authorization.k8s.io",
			Kind:     "ClusterRole",
			Name:     "system:metrics-server",
		},
		Subjects: []rbacv1.Subject{
			{
				Kind:      "ServiceAccount",
				Name:      MetricsServerName,
				Namespace: MetricsServerNamespace,
			},
		},
	}

	_, err = clientset.RbacV1().ClusterRoleBindings().Create(
		context.Background(), metricsBinding, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return err
	}

	return nil
}

// createService creates the metrics server service
func (p *MetricsProcessor) createService(clientset *kubernetes.Clientset) error {
	service := &corev1.Service{
		ObjectMeta: metav1.ObjectMeta{
			Name:      MetricsServerName,
			Namespace: MetricsServerNamespace,
			Labels: map[string]string{
				ComponentLabel: ComponentValue,
			},
		},
		Spec: corev1.ServiceSpec{
			Selector: map[string]string{
				ComponentLabel: ComponentValue,
			},
			Ports: []corev1.ServicePort{
				{
					Name:        "https",
					Port:        443,
					Protocol:    corev1.ProtocolTCP,
					TargetPort:  intstr.FromString("https"),
					AppProtocol: &[]string{"https"}[0],
				},
			},
		},
	}

	_, err := clientset.CoreV1().Services(MetricsServerNamespace).Create(
		context.Background(), service, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return err
	}
	return nil
}

// createDeployment creates the metrics server deployment
func (p *MetricsProcessor) createDeployment(clientset *kubernetes.Clientset, installType string) error {
	// Base args for metrics server
	args := []string{
		"--cert-dir=/tmp",
		"--secure-port=10250",
		"--kubelet-preferred-address-types=InternalIP,ExternalIP,Hostname",
		"--kubelet-use-node-status-port",
		"--metric-resolution=15s",
	}

	// Add insecure TLS for local development
	if strings.ToLower(installType) == "local" {
		args = append(args, "--kubelet-insecure-tls")
	}

	replicas := int32(1)
	deployment := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      MetricsServerName,
			Namespace: MetricsServerNamespace,
			Labels: map[string]string{
				ComponentLabel: ComponentValue,
			},
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &replicas,
			Selector: &metav1.LabelSelector{
				MatchLabels: map[string]string{
					ComponentLabel: ComponentValue,
				},
			},
			Strategy: appsv1.DeploymentStrategy{
				RollingUpdate: &appsv1.RollingUpdateDeployment{
					MaxUnavailable: &intstr.IntOrString{Type: intstr.Int, IntVal: 0},
				},
			},
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Labels: map[string]string{
						ComponentLabel: ComponentValue,
					},
				},
				Spec: corev1.PodSpec{
					ServiceAccountName: MetricsServerName,
					Containers: []corev1.Container{
						{
							Name:            MetricsServerName,
							Image:           "registry.k8s.io/metrics-server/metrics-server:v0.8.0",
							ImagePullPolicy: corev1.PullIfNotPresent,
							Args:            args,
							Ports: []corev1.ContainerPort{
								{
									ContainerPort: 10250,
									Name:          "https",
									Protocol:      corev1.ProtocolTCP,
								},
							},
							LivenessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path:   "/livez",
										Port:   intstr.FromString("https"),
										Scheme: corev1.URISchemeHTTPS,
									},
								},
								FailureThreshold: 3,
								PeriodSeconds:    10,
							},
							ReadinessProbe: &corev1.Probe{
								ProbeHandler: corev1.ProbeHandler{
									HTTPGet: &corev1.HTTPGetAction{
										Path:   "/readyz",
										Port:   intstr.FromString("https"),
										Scheme: corev1.URISchemeHTTPS,
									},
								},
								FailureThreshold:    3,
								InitialDelaySeconds: 20,
								PeriodSeconds:       10,
							},
							Resources: corev1.ResourceRequirements{
								Requests: corev1.ResourceList{
									corev1.ResourceCPU:    resource.MustParse("100m"),
									corev1.ResourceMemory: resource.MustParse("200Mi"),
								},
							},
							SecurityContext: &corev1.SecurityContext{
								AllowPrivilegeEscalation: &[]bool{false}[0],
								Capabilities: &corev1.Capabilities{
									Drop: []corev1.Capability{"ALL"},
								},
								ReadOnlyRootFilesystem: &[]bool{true}[0],
								RunAsNonRoot:           &[]bool{true}[0],
								RunAsUser:              &[]int64{1000}[0],
								SeccompProfile: &corev1.SeccompProfile{
									Type: corev1.SeccompProfileTypeRuntimeDefault,
								},
							},
							VolumeMounts: []corev1.VolumeMount{
								{
									MountPath: "/tmp",
									Name:      "tmp-dir",
								},
							},
						},
					},
					NodeSelector: map[string]string{
						"kubernetes.io/os": "linux",
					},
					PriorityClassName: "system-cluster-critical",
					Volumes: []corev1.Volume{
						{
							Name: "tmp-dir",
							VolumeSource: corev1.VolumeSource{
								EmptyDir: &corev1.EmptyDirVolumeSource{},
							},
						},
					},
				},
			},
		},
	}

	_, err := clientset.AppsV1().Deployments(MetricsServerNamespace).Create(
		context.Background(), deployment, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return err
	}
	return nil
}

// createAPIService creates the APIService for metrics server
func (p *MetricsProcessor) createAPIService(restConfig interface{}) error {
	// Create dynamic client
	dynamicClient, err := dynamic.NewForConfig(restConfig.(*rest.Config))
	if err != nil {
		return fmt.Errorf("failed to create dynamic client: %w", err)
	}

	// APIService GVR
	apiServiceGVR := schema.GroupVersionResource{
		Group:    "apiregistration.k8s.io",
		Version:  "v1",
		Resource: "apiservices",
	}

	// Create APIService object
	apiService := &unstructured.Unstructured{
		Object: map[string]interface{}{
			"apiVersion": "apiregistration.k8s.io/v1",
			"kind":       "APIService",
			"metadata": map[string]interface{}{
				"name": "v1beta1.metrics.k8s.io",
				"labels": map[string]interface{}{
					ComponentLabel: ComponentValue,
				},
			},
			"spec": map[string]interface{}{
				"group":                 "metrics.k8s.io",
				"groupPriorityMinimum":  int64(100),
				"insecureSkipTLSVerify": true,
				"service": map[string]interface{}{
					"name":      MetricsServerName,
					"namespace": MetricsServerNamespace,
				},
				"version":         "v1beta1",
				"versionPriority": int64(100),
			},
		},
	}

	_, err = dynamicClient.Resource(apiServiceGVR).Create(
		context.Background(), apiService, metav1.CreateOptions{})
	if err != nil && !errors.IsAlreadyExists(err) {
		return fmt.Errorf("failed to create APIService: %w", err)
	}

	return nil
}

// verifyInstallation checks if the installation was successful
func (p *MetricsProcessor) verifyInstallation(clientset *kubernetes.Clientset) error {
	// Wait for deployment to be ready with timeout
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	logger.Log(logger.LevelInfo, nil, nil, "Waiting for metrics server deployment to be ready...")

	err := wait.PollUntilContextCancel(ctx, 5*time.Second, true, func(ctx context.Context) (bool, error) {
		deployment, err := clientset.AppsV1().Deployments(MetricsServerNamespace).Get(
			ctx, MetricsServerName, metav1.GetOptions{})
		if err != nil {
			if errors.IsNotFound(err) {
				logger.Log(logger.LevelWarn, nil, nil, "Deployment not found, waiting...")
				return false, nil // Continue waiting
			}
			return false, err // Stop on other errors
		}

		// Check if deployment is ready
		if deployment.Status.ReadyReplicas > 0 && deployment.Status.ReadyReplicas == deployment.Status.Replicas {
			logger.Log(logger.LevelInfo, map[string]string{
				"readyReplicas": fmt.Sprintf("%d", deployment.Status.ReadyReplicas),
				"totalReplicas": fmt.Sprintf("%d", deployment.Status.Replicas),
			}, nil, "Metrics server deployment is ready")
			return true, nil
		}

		logger.Log(logger.LevelInfo, map[string]string{
			"readyReplicas": fmt.Sprintf("%d", deployment.Status.ReadyReplicas),
			"totalReplicas": fmt.Sprintf("%d", deployment.Status.Replicas),
		}, nil, "Deployment not ready yet, waiting...")
		return false, nil // Continue waiting
	})

	if err != nil {
		return fmt.Errorf("deployment failed to become ready within timeout: %w", err)
	}

	return nil
}

// Delete functions for uninstallation

func (p *MetricsProcessor) deleteDeployment(clientset *kubernetes.Clientset) error {
	err := clientset.AppsV1().Deployments(MetricsServerNamespace).Delete(
		context.Background(), MetricsServerName, metav1.DeleteOptions{})
	if err != nil && !errors.IsNotFound(err) {
		return err
	}
	return nil
}

func (p *MetricsProcessor) deleteService(clientset *kubernetes.Clientset) error {
	err := clientset.CoreV1().Services(MetricsServerNamespace).Delete(
		context.Background(), MetricsServerName, metav1.DeleteOptions{})
	if err != nil && !errors.IsNotFound(err) {
		return err
	}
	return nil
}

func (p *MetricsProcessor) deleteClusterRoleBindings(clientset *kubernetes.Clientset) error {
	bindings := []string{"metrics-server:system:auth-delegator", "system:metrics-server"}
	for _, binding := range bindings {
		err := clientset.RbacV1().ClusterRoleBindings().Delete(
			context.Background(), binding, metav1.DeleteOptions{})
		if err != nil && !errors.IsNotFound(err) {
			return err
		}
	}
	return nil
}

func (p *MetricsProcessor) deleteRoleBinding(clientset *kubernetes.Clientset) error {
	err := clientset.RbacV1().RoleBindings(MetricsServerNamespace).Delete(
		context.Background(), "metrics-server-auth-reader", metav1.DeleteOptions{})
	if err != nil && !errors.IsNotFound(err) {
		return err
	}
	return nil
}

func (p *MetricsProcessor) deleteClusterRoles(clientset *kubernetes.Clientset) error {
	roles := []string{"system:aggregated-metrics-reader", "system:metrics-server"}
	for _, role := range roles {
		err := clientset.RbacV1().ClusterRoles().Delete(
			context.Background(), role, metav1.DeleteOptions{})
		if err != nil && !errors.IsNotFound(err) {
			return err
		}
	}
	return nil
}

func (p *MetricsProcessor) deleteServiceAccount(clientset *kubernetes.Clientset) error {
	err := clientset.CoreV1().ServiceAccounts(MetricsServerNamespace).Delete(
		context.Background(), MetricsServerName, metav1.DeleteOptions{})
	if err != nil && !errors.IsNotFound(err) {
		return err
	}
	return nil
}

func (p *MetricsProcessor) deleteAPIService(restConfig interface{}) error {
	// Create dynamic client
	dynamicClient, err := dynamic.NewForConfig(restConfig.(*rest.Config))
	if err != nil {
		return fmt.Errorf("failed to create dynamic client: %w", err)
	}

	// APIService GVR
	apiServiceGVR := schema.GroupVersionResource{
		Group:    "apiregistration.k8s.io",
		Version:  "v1",
		Resource: "apiservices",
	}

	err = dynamicClient.Resource(apiServiceGVR).Delete(
		context.Background(), "v1beta1.metrics.k8s.io", metav1.DeleteOptions{})
	if err != nil && !errors.IsNotFound(err) {
		return err
	}
	return nil
}

func (p *MetricsProcessor) verifyUninstallation(clientset *kubernetes.Clientset) error {
	// Check if deployment is gone
	_, err := clientset.AppsV1().Deployments(MetricsServerNamespace).Get(
		context.Background(), MetricsServerName, metav1.GetOptions{})
	if err != nil && !errors.IsNotFound(err) {
		return fmt.Errorf("unexpected error checking deployment: %w", err)
	}
	if err == nil {
		return fmt.Errorf("deployment still exists")
	}

	return nil
}
