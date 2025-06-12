import React, { useState } from 'react';
import { AlertTriangle, Settings, CheckCircle, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import FileUpload from '@/components/ui/fileupload'; // Import your existing FileUpload component

interface AddKubeConfigDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onFilesAdded: (paths: string[]) => void;
}

interface KubeConfigFile {
	id: string;
	name: string;
	size: number;
	path: string;
	isValid: boolean;
	contexts: string[];
	clusters: string[];
	validationMessage?: string;
}

const AddKubeConfigDialog: React.FC<AddKubeConfigDialogProps> = ({
	open,
	onOpenChange,
	onFilesAdded
}) => {
	const [processedFiles, setProcessedFiles] = useState<KubeConfigFile[]>([]);
	const [isProcessing, setIsProcessing] = useState(false);
	const { toast } = useToast();

	// Validate kubeconfig file content
	const validateKubeConfig = async (file: File): Promise<{
		isValid: boolean;
		contexts: string[];
		clusters: string[];
		message?: string;
	}> => {
		try {
			const content = await file.text();

			// Try JSON first
			try {
				const config = JSON.parse(content);
				return validateConfigStructure(config);
			} catch {
				// Try YAML parsing (basic approach)
				return validateYamlConfig(content);
			}
		} catch (error) {
			return {
				isValid: false,
				contexts: [],
				clusters: [],
				message: 'Failed to read file content'
			};
		}
	};

	const validateConfigStructure = (config: any) => {
		const hasContexts = config.contexts && Array.isArray(config.contexts);
		const hasClusters = config.clusters && Array.isArray(config.clusters);
		const hasUsers = config.users && Array.isArray(config.users);
		const hasApiVersion = config.apiVersion;

		if (!hasApiVersion) {
			return {
				isValid: false,
				contexts: [],
				clusters: [],
				message: 'Missing apiVersion field'
			};
		}

		if (!hasContexts && !hasClusters && !hasUsers) {
			return {
				isValid: false,
				contexts: [],
				clusters: [],
				message: 'No contexts, clusters, or users found'
			};
		}

		return {
			isValid: true,
			contexts: config.contexts?.map((ctx: any) => ctx.name) || [],
			clusters: config.clusters?.map((cluster: any) => cluster.name) || [],
			message: 'Valid kubeconfig'
		};
	};

	const validateYamlConfig = (content: string) => {
		const hasApiVersion = content.includes('apiVersion:');
		const hasContexts = content.includes('contexts:');
		const hasClusters = content.includes('clusters:');
		const hasUsers = content.includes('users:');

		if (!hasApiVersion) {
			return {
				isValid: false,
				contexts: [],
				clusters: [],
				message: 'Missing apiVersion field'
			};
		}

		if (!hasContexts && !hasClusters && !hasUsers) {
			return {
				isValid: false,
				contexts: [],
				clusters: [],
				message: 'No contexts, clusters, or users found'
			};
		}

		// Extract context names (basic regex approach)
		const contextMatches = content.match(/- name:\s*([^\n\r]+)/g) || [];
		const contexts = contextMatches
			.map(match => match.replace('- name:', '').trim())
			.filter(name => name && !name.startsWith('cluster-') && !name.startsWith('user-'));

		return {
			isValid: true,
			contexts: contexts.slice(0, 10), // Limit for display
			clusters: [],
			message: 'Valid kubeconfig'
		};
	};

	// Custom file handler that validates kubeconfig files
	const handleFileUpload = async (uploadedFiles: any[]) => {
		setIsProcessing(true);

		const validatedFiles: KubeConfigFile[] = [];

		for (const uploadedFile of uploadedFiles) {
			if (uploadedFile.file && uploadedFile.progress === 100) {
				// Filter for kubeconfig-like files
				const isConfigFile = uploadedFile.name.includes('config') ||
					uploadedFile.name.includes('kubeconfig') ||
					uploadedFile.type === 'application/x-yaml' ||
					uploadedFile.type === 'text/yaml' ||
					uploadedFile.type === 'application/json' ||
					uploadedFile.name.endsWith('.yaml') ||
					uploadedFile.name.endsWith('.yml') ||
					uploadedFile.name.endsWith('.json') ||
					!uploadedFile.name.includes('.'); // Files without extension (common for kubeconfig)

				if (!isConfigFile) {
					continue; // Skip non-config files
				}

				const validation = await validateKubeConfig(uploadedFile.file);

				validatedFiles.push({
					id: uploadedFile.id,
					name: uploadedFile.name,
					size: uploadedFile.size,
					path: `/uploaded/kubeconfigs/${uploadedFile.name}`, // Simulated path
					isValid: validation.isValid,
					contexts: validation.contexts,
					clusters: validation.clusters,
					validationMessage: validation.message
				});
			}
		}

		setProcessedFiles(validatedFiles);
		setIsProcessing(false);
	};

	const handleAddConfigs = async () => {
		const validFiles = processedFiles.filter(f => f.isValid);

		if (validFiles.length === 0) {
			toast({
				title: "No valid files",
				description: "Please upload valid kubeconfig files before adding.",
				variant: "destructive",
			});
			return;
		}

		try {
			// In a real implementation, you would save these files to your backend
			const filePaths = validFiles.map(f => f.path);

			onFilesAdded(filePaths);

			toast({
				title: "Kubeconfig files added",
				description: `Successfully added ${validFiles.length} kubeconfig file${validFiles.length > 1 ? 's' : ''}.`,
			});

			// Reset and close dialog
			setProcessedFiles([]);
			onOpenChange(false);
		} catch (error) {
			toast({
				title: "Error adding files",
				description: "Failed to add kubeconfig files. Please try again.",
				variant: "destructive",
			});
		}
	};

	const handleCancel = () => {
		setProcessedFiles([]);
		onOpenChange(false);
	};

	const validFilesCount = processedFiles.filter(f => f.isValid).length;
	const invalidFilesCount = processedFiles.length - validFilesCount;

	return (
		<Dialog open={open} onOpenChange={onOpenChange}>
			<DialogContent className="max-w-2xl max-h-[90vh] overflow-hidden bg-white dark:bg-[#0B0D13]/50 backdrop-blur-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Settings className="w-5 h-5" />
						Add Kubeconfig Files
					</DialogTitle>
				</DialogHeader>

				<div>

					{/* File Upload Component */}
					<FileUpload />

					{/* Processing Status */}
					{isProcessing && (
						<div className="flex items-center justify-center py-4">
							<div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mr-3"></div>
							<span>Validating kubeconfig files...</span>
						</div>
					)}

					{/* Validation Results */}
					{processedFiles.length > 0 && !isProcessing && (
						<div className="space-y-4">
							<div className="flex items-center justify-between">
								<h3 className="font-medium">Validation Results</h3>
								<div className="flex gap-4 text-sm">
									{validFilesCount > 0 && (
										<span className="flex items-center text-green-600 dark:text-green-400">
											<CheckCircle className="w-4 h-4 mr-1" />
											{validFilesCount} valid
										</span>
									)}
									{invalidFilesCount > 0 && (
										<span className="flex items-center text-red-600 dark:text-red-400">
											<X className="w-4 h-4 mr-1" />
											{invalidFilesCount} invalid
										</span>
									)}
								</div>
							</div>

							<div className="max-h-60 overflow-y-auto space-y-2">
								{processedFiles.map((file) => (
									<div
										key={file.id}
										className={`p-3 rounded-lg border ${file.isValid
											? 'border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20'
											: 'border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-900/20'
											}`}
									>
										<div className="flex items-start justify-between">
											<div className="flex-1 min-w-0">
												<div className="flex items-center gap-2">
													{file.isValid ? (
														<CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
													) : (
														<AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
													)}
													<span className="font-medium truncate">{file.name}</span>
												</div>

												<div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
													{file.validationMessage}
												</div>

												{file.isValid && file.contexts.length > 0 && (
													<div className="text-xs text-gray-500 dark:text-gray-500 mt-2">
														<strong>Contexts:</strong> {file.contexts.slice(0, 3).join(', ')}
														{file.contexts.length > 3 && ` +${file.contexts.length - 3} more`}
													</div>
												)}
											</div>
										</div>
									</div>
								))}
							</div>
						</div>
					)}
				</div>

				<DialogFooter>
					<Button variant="outline" onClick={handleCancel}>
						Cancel
					</Button>
					<Button
						onClick={handleAddConfigs}
						disabled={validFilesCount === 0 || isProcessing}
					>
						Add {validFilesCount > 0 ? `${validFilesCount} ` : ''}Kubeconfig{validFilesCount !== 1 ? 's' : ''}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
};

export default AddKubeConfigDialog;