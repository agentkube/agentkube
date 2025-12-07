import React, { useState } from 'react';
import { AlertTriangle, Settings, CheckCircle, X } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import FileUpload from '@/components/ui/fileupload'; // Import your existing FileUpload component
import { uploadKubeconfigFile, uploadKubeconfigContent } from '@/api/cluster';
import { KubeConfigFile } from '@/types/cluster';
import { useCluster } from '@/contexts/clusterContext';

interface AddKubeConfigDialogProps {
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onFilesAdded: (paths: string[]) => void;
}

const AddKubeConfigDialog: React.FC<AddKubeConfigDialogProps> = ({
	open,
	onOpenChange,
	onFilesAdded
}) => {
	const [processedFiles, setProcessedFiles] = useState<KubeConfigFile[]>([]);
	const [isProcessing, setIsProcessing] = useState(false);
	const { toast } = useToast();
	const { contexts: existingContexts } = useCluster();

	// Check for duplicate context names
	const checkForDuplicateContexts = (contexts: string[]): string[] => {
		const existingNames = existingContexts.map(ctx => ctx.name);
		return contexts.filter(ctx => existingNames.includes(ctx));
	};

	// Validate kubeconfig file content
	const validateKubeConfig = async (file: File): Promise<{
		isValid: boolean;
		contexts: string[];
		clusters: string[];
		message?: string;
	}> => {
		try {
			const content = await file.text();
			return validateConfigStructure(content);
		} catch (error) {
			return {
				isValid: false,
				contexts: [],
				clusters: [],
				message: 'Failed to read file content'
			};
		}
	};

	const validateConfigStructure = (content: string) => {
		try {
			// Try JSON first
			const config = JSON.parse(content);
			return validateParsedConfig(config);
		} catch {
			// Try basic YAML validation
			return validateYamlContent(content);
		}
	};

	const validateParsedConfig = (config: any) => {
		const hasApiVersion = config.apiVersion;
		const hasContexts = config.contexts && Array.isArray(config.contexts);
		const hasClusters = config.clusters && Array.isArray(config.clusters);

		if (!hasApiVersion) {
			return {
				isValid: false,
				contexts: [],
				clusters: [],
				message: 'Missing apiVersion field'
			};
		}

		return {
			isValid: true,
			contexts: config.contexts?.map((ctx: any) => ctx.name) || [],
			clusters: config.clusters?.map((cluster: any) => cluster.name) || [],
			message: 'Valid kubeconfig'
		};
	};

	const validateYamlContent = (content: string) => {
		const hasApiVersion = content.includes('apiVersion:');
		const hasContexts = content.includes('contexts:');
		const hasClusters = content.includes('clusters:');

		if (!hasApiVersion) {
			return {
				isValid: false,
				contexts: [],
				clusters: [],
				message: 'Missing apiVersion field'
			};
		}

		if (!hasContexts && !hasClusters) {
			return {
				isValid: false,
				contexts: [],
				clusters: [],
				message: 'No contexts or clusters found'
			};
		}

		// Extract context names
		const contextMatches = content.match(/- name:\s*([^\n\r]+)/g) || [];
		const contexts = contextMatches
			.map(match => match.replace('- name:', '').trim())
			.filter(name => name);

		return {
			isValid: true,
			contexts: contexts.slice(0, 5),
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

				// Check for duplicate contexts
				const duplicateContexts = checkForDuplicateContexts(validation.contexts);
				let validationMessage = validation.message;
				let isValid = validation.isValid;

				if (duplicateContexts.length > 0) {
					validationMessage = `Warning: Context(s) already exist: ${duplicateContexts.join(', ')}. Upload will overwrite existing contexts.`;
					// Still allow upload but show warning
				}

				validatedFiles.push({
					id: uploadedFile.id,
					name: uploadedFile.name,
					size: uploadedFile.size,
					path: `/uploaded/kubeconfigs/${uploadedFile.name}`, // Simulated path
					isValid: isValid,
					contexts: validation.contexts,
					clusters: validation.clusters,
					validationMessage: validationMessage,
					file: uploadedFile.file,
					isFromText: uploadedFile.isFromText || false,
					primaryContext: validation.contexts.length > 0 ? validation.contexts[0] : null
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
			const results = [];
			const uploadedPaths = []; // Add this line

			for (const file of validFiles) {
				if (file.file) {
					if (file.isFromText) {
						// Handle text content
						const content = await file.file.text();
						const sourceName = file.primaryContext || file.name.replace(/\.(yaml|yml|json)$/, '');
						const result = await uploadKubeconfigContent({
							content,
							sourceName: sourceName,
							ttl: 0 // No expiry for now
						});
						results.push(result);
						// Add the file path if upload was successful
						if (result.success && result.filePath) { // Add this block
							uploadedPaths.push(result.filePath);
						}
					} else {
						// Handle file upload
						console.log("About to upload file:", file.file);
						console.log("File details:", {
							name: file.name,
							size: file.size,
							fileType: file.file?.type,
							isFromText: file.isFromText,
							hasFile: !!file.file
						});

						const sourceName = file.primaryContext || file.name.replace(/\.(yaml|yml|json)$/, '');

						const result = await uploadKubeconfigFile(
							file.file,
							sourceName,
							0 // No expiry for now
						);

						if (result.success === false) {
							toast({
								title: "Error uploading files",
								description: result.message,
								variant: "destructive",
							});
							return
						}


						results.push(result);
						// Add the file path if upload was successful
						if (result.success && result.filePath) { // Add this block
							uploadedPaths.push(result.filePath);
						}
					}
				}
			}

			const successfulUploads = results.filter(r => r.success);
			const totalContexts = successfulUploads.reduce((acc, r) => acc + (r.contextsAdded?.length || 0), 0);

			toast({
				title: "Kubeconfig files uploaded",
				description: `Successfully added ${totalContexts} context(s) from ${successfulUploads.length} file(s).`,
			});

			// Trigger refresh of contexts with uploaded file paths
			onFilesAdded(uploadedPaths); // Change this line

			// Reset and close dialog
			setProcessedFiles([]);
			onOpenChange(false);
		} catch (error) {
			console.error('Upload error:', error);
			toast({
				title: "Error uploading files",
				description: "Failed to upload kubeconfig files. Please try again.",
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
			<DialogContent className="max-w-2xl max-h-[90vh] -mt-36 overflow-hidden bg-white dark:bg-[#0B0D13]/50 backdrop-blur-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<Settings className="w-5 h-5" />
						Add Kubeconfig Files
					</DialogTitle>
				</DialogHeader>

				<div>

					{/* File Upload Component */}
					<FileUpload onFilesUploaded={handleFileUpload} />

					{/* Processing Status */}
					{isProcessing && (
						<div className="flex items-center justify-center py-4">
							<div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-500 mr-3"></div>
							<span>Validating kubeconfig files...</span>
						</div>
					)}

					{/* Validation Results */}
					{processedFiles.length > 0 && !isProcessing && (
						<div className="space-y-4 px-6">
							<div className="flex items-center justify-between">
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
													<span className="font-medium text-sm truncate">{file.name}</span>
												</div>

												<div className="text-sm text-gray-600 dark:text-gray-400 mt-1">
													{file.validationMessage}
												</div>

												{file.isValid && file.contexts.length > 0 && (
													<div className="text-xs text-gray-500 dark:text-gray-500">
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