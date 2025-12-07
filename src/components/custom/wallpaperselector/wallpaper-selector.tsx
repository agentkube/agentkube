// import React, { useState, useRef } from 'react';
// import { Upload, X, Check, Image as ImageIcon } from 'lucide-react';
// import { Button } from '@/components/ui/button';
// import { ThemeBackground, DEFAULT_WALLPAPERS } from '@/types/theme';
// import { useCustomTheme } from '@/components/theme-provider';
// import { getSettings, updateSettingsSection } from '@/api/settings';
// import { useToast } from '@/hooks/use-toast';

// interface WallpaperSelectorProps {
//   className?: string;
// }

// const WallpaperSelector: React.FC<WallpaperSelectorProps> = ({ className }) => {
//   const { customWallpaper, applyWallpaper } = useCustomTheme();
//   const [isLoading, setIsLoading] = useState(false);
//   const fileInputRef = useRef<HTMLInputElement>(null);
//   const { toast } = useToast();

//   const handleWallpaperSelect = async (wallpaper: ThemeBackground | null) => {
//     try {
//       setIsLoading(true);

//       // Apply wallpaper immediately
//       applyWallpaper(wallpaper);

//       // Save to settings - store wallpaperPath instead of wallpaper object
//       const currentSettings = await getSettings();
//       const wallpaperPath = wallpaper?.type === 'image' ? wallpaper.value : null;

//       const newThemeConfig = {
//         baseMode: 'dark' as const,
//         allowCustomWallpaper: true,
//         ...currentSettings.appearance?.themeConfig,
//         wallpaperPath, // Store the path, not the object
//       };

//       await updateSettingsSection('appearance', {
//         ...currentSettings.appearance,
//         themeConfig: newThemeConfig,
//       });

//       toast({
//         title: "Wallpaper updated",
//         description: wallpaper ? `Wallpaper changed to ${wallpaper.name}` : "Wallpaper removed",
//       });
//     } catch (error) {
//       console.error('Failed to save wallpaper:', error);
//       toast({
//         title: "Error",
//         description: "Failed to save wallpaper. Please try again.",
//         variant: "destructive",
//       });
//     } finally {
//       setIsLoading(false);
//     }
//   };

//   const handleCustomImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
//     const file = event.target.files?.[0];
//     if (file) {
//       if (file.size > 25 * 1024 * 1024) { // 25MB limit
//         toast({
//           title: "File too large",
//           description: "Please select an image smaller than 25MB.",
//           variant: "destructive",
//         });
//         return;
//       }

//       try {
//         setIsLoading(true);

//         // Create a temporary object URL for immediate preview
//         const objectUrl = URL.createObjectURL(file);
//         const customWallpaper: ThemeBackground = {
//           type: 'image',
//           value: objectUrl,
//           name: file.name,
//         };

//         // Apply wallpaper immediately for preview
//         applyWallpaper(customWallpaper);

//         // TODO: In a real application, you would save the file to a local directory
//         // For now, we'll use the object URL (which will work temporarily)
//         // In production, implement file saving to ~/.agentkube/wallpapers/
//         const wallpaperPath = objectUrl; // This should be a saved file path

//         const currentSettings = await getSettings();
//         const newThemeConfig = {
//           baseMode: 'dark' as const,
//           allowCustomWallpaper: true,
//           ...currentSettings.appearance?.themeConfig,
//           wallpaperPath,
//         };

//         await updateSettingsSection('appearance', {
//           ...currentSettings.appearance,
//           themeConfig: newThemeConfig,
//         });

//         toast({
//           title: "Wallpaper updated",
//           description: `Custom wallpaper "${file.name}" has been applied`,
//         });
//       } catch (error) {
//         console.error('Failed to save custom wallpaper:', error);
//         toast({
//           title: "Error",
//           description: "Failed to save custom wallpaper. Please try again.",
//           variant: "destructive",
//         });
//       } finally {
//         setIsLoading(false);
//       }
//     }
//   };

//   const isSelected = (wallpaper: ThemeBackground | null) => {
//     if (!customWallpaper && !wallpaper) return true;
//     if (!customWallpaper || !wallpaper) return false;
//     return customWallpaper.value === wallpaper.value && customWallpaper.type === wallpaper.type;
//   };

//   return (
//     <div className={`space-y-4 ${className}`}>
//       <div>
//         <h3 className="text-lg font-medium mb-2">Background Wallpaper</h3>
//         <p className="text-gray-700 dark:text-gray-400 text-sm mb-4">
//           Choose a background for your application or upload your own image.
//         </p>
//       </div>

//       {/* Default wallpapers grid */}
//       <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
//         {DEFAULT_WALLPAPERS.map((wallpaper) => (
//           <button
//             key={`${wallpaper.type}-${wallpaper.value}`}
//             disabled={isLoading}
//             className={`relative aspect-video rounded-lg border-2 overflow-hidden transition-all hover:scale-105 ${isSelected(wallpaper)
//                 ? 'border-blue-500 ring-2 ring-blue-500/20'
//                 : 'border-gray-300 dark:border-gray-700 hover:border-gray-400 dark:hover:border-gray-600'
//               }`}
//             onClick={() => handleWallpaperSelect(wallpaper)}
//           >
//             <div
//               className="w-full h-full"
//               style={{
//                 background: wallpaper.type === 'none'
//                   ? 'transparent'
//                   : wallpaper.type === 'color'
//                     ? wallpaper.value
//                     : wallpaper.type === 'gradient'
//                       ? wallpaper.value
//                       : `url("${wallpaper.value}")`,
//                 backgroundSize: 'cover',
//                 backgroundPosition: 'center',
//               }}
//             >
//               {wallpaper.type === 'none' && (
//                 <div className="flex items-center justify-center h-full bg-gray-100 dark:bg-gray-800/40">
//                   <X size={24} className="text-gray-400" />
//                 </div>
//               )}
//             </div>

//             {/* Selection indicator */}
//             {isSelected(wallpaper) && (
//               <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
//                 <Check size={12} className="text-white" />
//               </div>
//             )}

//             {/* Name overlay */}
//             <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-white text-xs p-1 text-center">
//               {wallpaper.name}
//             </div>
//           </button>
//         ))}
//       </div>

//       {/* Custom image upload */}
//       <div className="border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg p-6 text-center">
//         <input
//           ref={fileInputRef}
//           type="file"
//           accept="image/*"
//           onChange={handleCustomImageUpload}
//           className="hidden"
//         />

//         <ImageIcon className="mx-auto h-12 w-12 text-gray-400 mb-2" />
//         <p className="text-gray-600 dark:text-gray-400 mb-2">
//           Upload your own wallpaper
//         </p>
//         <p className="text-sm text-gray-500 dark:text-gray-500 mb-4">
//           PNG, JPG, GIF up to 25MB
//         </p>

//         <Button
//           variant="outline"
//           onClick={() => fileInputRef.current?.click()}
//           disabled={isLoading}
//           className="flex items-center gap-2"
//         >
//           <Upload size={16} />
//           Choose File
//         </Button>
//       </div>

//       {/* Current custom wallpaper display */}
//       {customWallpaper && customWallpaper.type === 'image' && !DEFAULT_WALLPAPERS.find(w => w.value === customWallpaper.value) && (
//         <div className="mt-4">
//           <h4 className="text-sm font-medium mb-2">Current Custom Wallpaper:</h4>
//           <div className="flex items-center justify-between p-3 border rounded-lg">
//             <div className="flex items-center gap-3">
//               <div
//                 className="w-16 h-10 rounded border bg-cover bg-center"
//                 style={{ backgroundImage: `url("${customWallpaper.value}")` }}
//               />
//               <span className="text-sm truncate max-w-48">{customWallpaper.name}</span>
//             </div>
//             <Button
//               variant="ghost"
//               size="sm"
//               onClick={() => handleWallpaperSelect(null)}
//               disabled={isLoading}
//               className="text-red-500 hover:text-red-700"
//             >
//               <X size={16} />
//             </Button>
//           </div>
//         </div>
//       )}
//     </div>
//   );
// };

// export default WallpaperSelector;