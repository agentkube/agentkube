import React from 'react';
import { Bell, BellDot, Check, X, ExternalLink, Package, AlertCircle, Info, BellMinus } from 'lucide-react';
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
	Tooltip,
	TooltipContent,
	TooltipProvider,
	TooltipTrigger,
} from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';

// Mock notification data - replace with your actual data source
const mockNotifications = [
	{
		id: 1,
		type: 'update',
		title: 'System Update Available',
		message: 'A new version (v2.1.0) is ready to install',
		timestamp: '2 minutes ago',
		read: false,
		icon: Package,
	},
	{
		id: 2,
		type: 'info',
		title: 'Background Task Completed',
		message: 'Docker container deployment finished successfully',
		timestamp: '5 minutes ago',
		read: false,
		icon: Info,
	},
	{
		id: 3,
		type: 'warning',
		title: 'Resource Usage Alert',
		message: 'CPU usage is above 80% for the past 10 minutes',
		timestamp: '1 hour ago',
		read: true,
		icon: AlertCircle,
	},
	{
		id: 4,
		type: 'success',
		title: 'Deployment Successful',
		message: 'Application deployed to production environment',
		timestamp: '2 hours ago',
		read: true,
		icon: Check,
	},
];

interface NotificationDropdownProps {
	className?: string;
}

const NotificationDropdown: React.FC<NotificationDropdownProps> = ({ className }) => {
	const [notifications, setNotifications] = React.useState(mockNotifications);

	const unreadCount = notifications.filter(n => !n.read).length;

	const markAsRead = (id: number) => {
		setNotifications(prev =>
			prev.map(n => n.id === id ? { ...n, read: true } : n)
		);
	};

	const markAllAsRead = () => {
		setNotifications(prev => prev.map(n => ({ ...n, read: true })));
	};

	const clearAllNotifications = () => {
		setNotifications([]);
	};

	const removeNotification = (id: number) => {
		setNotifications(prev => prev.filter(n => n.id !== id));
	};

	const getNotificationIcon = (type: string) => {
		switch (type) {
			case 'update':
				return 'text-blue-400';
			case 'warning':
				return 'text-yellow-400';
			case 'success':
				return 'text-green-400';
			case 'info':
			default:
				return 'text-gray-400';
		}
	};

	return (
		<DropdownMenu>
			<TooltipProvider>
				<Tooltip>
					<TooltipTrigger asChild>
						<DropdownMenuTrigger asChild>
							<button
								className={`relative text-gray-400/80 backdrop-blur-md hover:text-blue-500 cursor-pointer group hover:bg-gray-100/10 p-1 ${className}`}
							>
								{unreadCount > 0 ? (
									<>
										<BellDot className='h-[0.8rem]' />
										{/* <Badge 
                      variant="destructive" 
                      className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-gray-500 dark:bg-gray-500/30 backdrop-blur-md hover:bg-red-500"
                    >
                      {unreadCount > 9 ? '9+' : unreadCount}
                    </Badge> */}
									</>
								) : (
									<Bell className='h-[0.8rem]' />
								)}
							</button>
						</DropdownMenuTrigger>
					</TooltipTrigger>
					<TooltipContent className="bg-white dark:bg-[#131112] text-gray-900 dark:text-gray-100">
						<p>Notifications {unreadCount > 0 && `(${unreadCount} unread)`}</p>
					</TooltipContent>
				</Tooltip>
			</TooltipProvider>

			<DropdownMenuContent
				className="w-[28rem] bg-white dark:bg-[#0B0D13]/40 backdrop-blur-md border-gray-200 rounded-lg dark:border-neutral-600/30 max-h-96 "
				align="end"
				sideOffset={5}
			>
				<div className="flex items-center justify-between bg-gray-300/50  dark:bg-gray-500/10  backdrop-blur-md px-2 ">
					<DropdownMenuLabel className="text-sm font-medium text-gray-900 dark:text-gray-100">
						Notifications
					</DropdownMenuLabel>
					<div className="flex items-center space-x-1">
						{unreadCount > 0 && (
							<Button
								variant="ghost"
								size="sm"
								onClick={markAllAsRead}
								className="h-6 px-2 text-xs text-blue-600 hover:text-blue-700 dark:text-gray-400 dark:hover:text-gray-300"
							>
								Mark all read
							</Button>
						)}
						{notifications.length > 0 && (
							<TooltipProvider>
								<Tooltip>
									<TooltipTrigger asChild>
										<button
											onClick={clearAllNotifications}
											className="h-6 w-6 flex items-center justify-center hover:bg-gray-200 dark:hover:bg-gray-700/30 rounded p-1 transition-colors"
										>
											<BellMinus className="h-[0.8rem] text-gray-500 dark:text-gray-400" />
										</button>
									</TooltipTrigger>
									<TooltipContent className="bg-white dark:bg-[#131112] text-gray-900 dark:text-gray-100">
										<p>Clear all notifications</p>
									</TooltipContent>
								</Tooltip>
							</TooltipProvider>
						)}
					</div>
				</div>

				{notifications.length === 0 ? (
					<div className="p-4 text-center text-gray-500 dark:text-gray-400">
						<Bell className="mx-auto h-8 w-8 mb-2 opacity-50" />
						<p className="text-sm">No notifications</p>
					</div>
				) : (
					<div className="max-h-80 overflow-y-auto  scrollbar-thin scrollbar-thumb-gray-700 scrollbar-track-transparent
            [&::-webkit-scrollbar]:w-1.5 
            [&::-webkit-scrollbar-track]:bg-transparent 
            [&::-webkit-scrollbar-thumb]:bg-gray-700/30 
            [&::-webkit-scrollbar-thumb]:rounded-full
            [&::-webkit-scrollbar-thumb:hover]:bg-gray-700/50">
						{notifications.map((notification) => {
							const IconComponent = notification.icon;
							return (
								<DropdownMenuItem
									key={notification.id}
									className={`p-3 cursor-pointer focus:bg-gray-50 dark:focus:bg-gray-800/50 ${!notification.read ? 'bg-gray-100 dark:bg-gray-800/40' : ''
										}`}
									onClick={() => markAsRead(notification.id)}
								>
									<div className="flex items-start space-x-3 w-full">
										<div className={`mt-0.5 ${getNotificationIcon(notification.type)}`}>
											<IconComponent className="h-4 w-4" />

										</div>
										<div className="flex-1 space-y-1">
											<div className="flex items-start justify-between">
												<p className="text-sm font-medium text-gray-900 dark:text-gray-100 leading-tight">
													{notification.title}
												</p>
												<div className="flex items-center space-x-1 ml-2">

													<button
														onClick={(e) => {
															e.stopPropagation();
															removeNotification(notification.id);
														}}
														className="hover:bg-gray-200 dark:hover:bg-gray-700 rounded p-0.5 transition-opacity"
													>
														<X className="h-3 w-3 text-gray-500" />
													</button>
												</div>
											</div>
											<p className="text-xs text-gray-600 dark:text-gray-400 leading-tight">
												{notification.message}
											</p>
											<p className="text-xs text-gray-500 dark:text-gray-500">
												{notification.timestamp}
											</p>
										</div>
									</div>
								</DropdownMenuItem>
							);
						})}
					</div>
				)}



			</DropdownMenuContent>
		</DropdownMenu>
	);
};

export default NotificationDropdown;