import React, { useState, useRef, useEffect } from 'react';
import { X, ArrowUp, BotMessageSquare, Search, ScanSearch, Loader, Plus, Lightbulb, Terminal } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { motion, AnimatePresence } from 'framer-motion';
import { AddResourceLogsPicker, AutoResizeTextarea, ModelSelector, ResourceContext as ResourceContextComponent, ResourcePreview, ResourceLogPreview } from '@/components/custom';
import { EnrichedSearchResult } from '@/types/search';
import { toast as sooner } from "sonner";
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';
import { LogsSelection } from '@/types/logs';
import { submitInvestigationTask } from '@/api/task';
import { InvestigationRequest, InvestigationResponse, ResourceContext, LogContext } from '@/types/task';
import { useCluster } from '@/contexts/clusterContext';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/useAuth';
import UpgradeToProContainer from '@/components/custom/chat/upgradetopro.component';
import SignInContainer from '@/components/custom/chat/signin.component';

interface BackgroundTaskDialogProps {
	isOpen: boolean;
	onClose: () => void;
	resourceName?: string;
	resourceType?: string;
}

const mentionData = [
	{ id: 1, name: '', description: '' },
];

const BackgroundTaskDialog: React.FC<BackgroundTaskDialogProps> = ({
	isOpen,
	onClose,
	resourceName,
	resourceType
}) => {
	const [inputValue, setInputValue] = useState<string>('');
	const [selectedModel, setSelectedModel] = useState<string>('openai/gpt-4o-mini');
	const [contextFiles, setContextFiles] = useState<EnrichedSearchResult[]>([]);
	const [previewResource, setPreviewResource] = useState<EnrichedSearchResult | null>(null);
	const [isLoading, setIsLoading] = useState<boolean>(false);
	const [isInputFocused, setIsInputFocused] = useState<boolean>(false);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const [contextLogs, setContextLogs] = useState<LogsSelection[]>([]);
	const { currentContext } = useCluster();
	const navigate = useNavigate();
	const { user } = useAuth();

	useEffect(() => {
		if (isOpen && inputRef.current) {
			inputRef.current.focus();
		}
	}, [isOpen]);

	useEffect(() => {
		const handleEscape = (e: KeyboardEvent) => {
			if (e.key === 'Escape') {
				onClose();
			}
		};

		if (isOpen) {
			document.addEventListener('keydown', handleEscape);
		}

		return () => {
			document.removeEventListener('keydown', handleEscape);
		};
	}, [isOpen, onClose]);

	const createBackgroundTask = async (message: string) => {
		setIsLoading(true);

		try {
			// Build resource context from selected files
			const resourceContext: ResourceContext[] = contextFiles.map(file => ({
				resource_name: `${file.resourceType}/${file.resourceName}`,
				resource_content: JSON.stringify(file) // Or actual resource content if available
			}));

			// Build log context from selected logs
			const logContext: LogContext[] = contextLogs.map(log => ({
				log_name: `${log.podName}/${log.containerName}`,
				log_content: log.logs || '' // Use logs property from LogsSelection
			}));

			// Create investigation request
			const investigationRequest: InvestigationRequest = {
				prompt: message,
				model: selectedModel,
				context: {
					resource_name: resourceName,
					resource_type: resourceType,
					kubecontext: currentContext?.name,
				},
				resource_context: resourceContext.length > 0 ? resourceContext : undefined,
				log_context: logContext.length > 0 ? logContext : undefined,
			};

			// Submit investigation
			const response: InvestigationResponse = await submitInvestigationTask(investigationRequest);

			sooner("Investigation Started", {
				description: `Task ID: ${response.task_id}`,
				action: {
					label: "View Task",
					onClick: () => {
						// Navigate to task details
						navigate(`/dashboard/tasks/report/${response.task_id}`);
					},
				},
				cancel: {
					label: "Dismiss",
					onClick: () => { },
				}
			});

			setInputValue('');
			setContextFiles([]);
			setContextLogs([]);
			onClose();

		} catch (error) {
			console.error('Failed to create investigation:', error);
			sooner("Investigation Failed", {
				description: error instanceof Error ? error.message : 'Unknown error occurred',
				action: {
					label: "Retry",
					onClick: () => createBackgroundTask(message),
				}
			});
		} finally {
			setIsLoading(false);
		}
	};

	const handleSubmit = async (e: React.FormEvent | React.KeyboardEvent): Promise<void> => {
		e.preventDefault();
		if (!inputValue.trim() || isLoading) return;

		// Check if user is authenticated and block the request if not
		if (!user || !user.isAuthenticated) {
			sooner("Sign In Required", {
				description: "This feature requires you to be signed in. Please sign in to continue using the AI assistant and access your free credits.",
			});
			return;
		}

		// Check if user has exceeded their usage limit
		if (user.usage_limit && (user.usage_count || 0) >= user.usage_limit) {
			sooner("Usage Limit Exceeded", {
				description: `You have reached your usage limit of ${user.usage_limit} requests. Please upgrade your plan to continue using the AI assistant.`,
			});
			return;
		}

		await createBackgroundTask(inputValue.trim());
	};

	const handleResourcePreview = (resource: EnrichedSearchResult) => {
		setPreviewResource(resource);
	};

	const handleLogsSelect = (selection: LogsSelection) => {
		setContextLogs(prev => [
			...prev.filter(log =>
				!(log.podName === selection.podName &&
					log.namespace === selection.namespace &&
					log.containerName === selection.containerName)
			),
			selection
		]);
	};

	const handleAddContext = (resource: any): void => {
		setContextFiles(prev => [
			...prev.filter(r =>
				!(r.resourceName === resource.resourceName &&
					r.resourceType === resource.resourceType &&
					r.namespace === resource.namespace)
			),
			resource
		]);
	};

	const handleInputFocus = (): void => {
		setIsInputFocused(true);
	};

	const handleInputBlur = (): void => {
		// Keep it visible once shown
	};

	const handleMentionSelect = (item: any) => {
		console.log('Mentioned:', item.name);
	};

	if (!isOpen) return null;

	return (
		<div className="fixed inset-0 z-50 pt-40 flex justify-center">
			<div className="absolute inset-0 bg-background/20 backdrop-blur-sm" onClick={onClose} />
			<AnimatePresence>
				<motion.div
					className="relative w-full max-w-2xl bg-popover h-fit backdrop-blur-md rounded-xl shadow-2xl border border-border overflow-hidden"
					initial={{ scale: 0.95, opacity: 0 }}
					animate={{ scale: 1, opacity: 1 }}
					exit={{ scale: 0.95, opacity: 0 }}
					transition={{ duration: 0.2 }}
				>
					{/* Background Task Header */}
					<div className="flex items-center justify-between  px-2 border-b border-border">
						<div className='flex items-center space-x-2 text-xs '>
							<div className='flex items-center text-foreground space-x-1'>
								<ScanSearch className='h-4' />
								<h3 className="text-xs font-medium">
									Investigation Task
								</h3>
							</div>

							{resourceName && (
								<>
									<span className="text-muted-foreground">
										{resourceType}/{resourceName}
									</span>
								</>
							)}
						</div>
						<Button
							variant="ghost"
							size="sm"
							onClick={onClose}
							className="p-1 text-muted-foreground"
						>
							<X className="h-4 w-4" />
						</Button>
					</div>

					{/* Main Container */}
					<div className="px-2 py-1">
						{/* Input Form */}
						<form
							onSubmit={handleSubmit}
							className="flex gap-3 items-end">
							<div className="flex-1 h-52">
								<AutoResizeTextarea
									ref={inputRef}
									value={inputValue}
									onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setInputValue(e.target.value)}
									onFocus={handleInputFocus}
									onBlur={handleInputBlur}
									onSubmit={handleSubmit}
									// placeholder="What would you like to investigate? (e.g., '')"
									animatedSuggestions={[
										"What would you like to investigate?",
										"Check pod health and recent issues",
										"Run Stress testing on my deployment in kube-system namespace"
									]}
									disabled={isLoading}
									className="border-transparent h-64"
									autoFocus={true}
									mentionItems={mentionData}
									onMentionSelect={handleMentionSelect}
								/>
							</div>
						</form>

						<div className='flex flex-wrap'>
							{/* Context Files */}
							{contextFiles.length > 0 && (
								<div className="mb-1 flex flex-wrap gap-1 relative">
									{contextFiles.map(file => (
										<div
											key={file.resourceName}
											className="flex items-center text-xs bg-secondary border border-border rounded px-2 py-1"
										>
											<div
												className="flex items-center cursor-pointer"
												onClick={() => handleResourcePreview(file)}
											>
												<img src={KUBERNETES_LOGO} className="w-4 h-4" alt="Kubernetes logo" />
												<span className="ml-1">{file.resourceName}</span>
											</div>
											<X
												size={12}
												className="ml-1 cursor-pointer"
												onClick={(e) => {
													e.stopPropagation();
													setContextFiles(prev => prev.filter(f => f.resourceName !== file.resourceName));
												}}
											/>
										</div>
									))}

									{previewResource && (
										<ResourcePreview
											resource={previewResource}
											onClose={() => setPreviewResource(null)}
										/>
									)}
								</div>
							)}

							{contextLogs.length > 0 && (
								<div className="mb-1 flex flex-wrap gap-1">
									{contextLogs.map(log => (
										<ResourceLogPreview
											key={`${log.podName}-${log.containerName}`}
											log={log}
											onRemove={() => {
												setContextLogs(prev => prev.filter(l =>
													!(l.podName === log.podName && l.containerName === log.containerName)
												));
											}}
										/>
									))}
								</div>
							)}
						</div>

						{/* Sign In and Upgrade Containers */}
						<SignInContainer />
						<UpgradeToProContainer />

						<div className='flex items-center text-xs p-2 text-muted-foreground bg-muted-foreground/20 my-2 rounded-lg'>
							<Lightbulb size={14} className="mr-1" />
							<p> Describe what you'd like to investigate about this resource. The analysis will run in the background.</p>
						</div>
						<div className="flex justify-between items-center relative">
							<div className='flex items-center'>
								<ResourceContextComponent onResourceSelect={handleAddContext} />

								<AddResourceLogsPicker onLogsSelect={handleLogsSelect} />
								<button
									className="flex items-center text-gray-400 hover:text-gray-300 transition-colors rounded px-2 py-1"
								>
									<Plus size={14} className="mr-1" />
									<span className="text-xs">Add Metrics</span>
								</button>
							</div>

							<div className='space-x-3 flex items-center'>
								<ModelSelector selectedModel={selectedModel} onModelChange={setSelectedModel} />
								<Button
									type="submit"
									onClick={handleSubmit}
									disabled={isLoading || !inputValue.trim()}
									className="p-3 h-6 w-6 rounded-full text-primary-foreground bg-primary hover:bg-primary/90"
								>
									{isLoading ? (
										<Loader className="animate-spin rounded-full h-4 w-4" />
									) : (
										<ArrowUp className='h-4 w-4' />
									)}
								</Button>
							</div>
						</div>
					</div>
				</motion.div>

			</AnimatePresence>
		</div>
	);
};

export default BackgroundTaskDialog;