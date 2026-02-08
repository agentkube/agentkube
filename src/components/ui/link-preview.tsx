// LinkPreview.tsx
import { openExternalUrl } from '@/api/external';
import * as HoverCard from '@radix-ui/react-hover-card';
import { AnimatePresence, motion, useMotionValue, useSpring } from 'framer-motion';
import { encode } from 'qss';
import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';

// Utils function to replace the cn utility
const cn = (...classes: (string | undefined)[]) => {
  return classes.filter(Boolean).join(' ');
};

type LinkPreviewProps = {
  children: React.ReactNode;
  url: string;
  className?: string;
  width?: number;
  height?: number;
  quality?: number;
  layout?: string;
} & (
    | { isStatic: true; imageSrc: string }
    | { isStatic?: false; imageSrc?: never }
  );

export const LinkPreview = ({
  children,
  url,
  className,
  width = 280,
  height = 180,
  quality = 50,
  layout = "fixed",
  isStatic = false,
  imageSrc = "",
}: LinkPreviewProps) => {
  let src: string;
  console.log(quality, layout)
  if (!isStatic) {
    const params = encode({
      url,
      screenshot: true,
      meta: false,
      embed: "screenshot.url",
      colorScheme: "dark",
      "viewport.isMobile": true,
      "viewport.deviceScaleFactor": 1,
      "viewport.width": width * 3,
      "viewport.height": height * 3,
    });
    src = `https://api.microlink.io/?${params}`;
  } else {
    src = imageSrc;
  }

  const [isOpen, setOpen] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const springConfig = { stiffness: 100, damping: 15 };
  const x = useMotionValue(0);
  const translateX = useSpring(x, springConfig);

  const handleMouseMove = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const targetRect = event.currentTarget.getBoundingClientRect();
    const eventOffsetX = event.clientX - targetRect.left;
    const offsetFromCenter = (eventOffsetX - targetRect.width / 2) / 2;
    x.set(offsetFromCenter);
  };

  return (
    <>
      {isMounted ? (
        <div className="hidden">
          <img
            src={src}
            width={width}
            height={height}
            loading="eager"
            alt="hidden image"
            style={{
              maxWidth: '100%',
              height: 'auto'
            }}
          />
        </div>
      ) : null}

      <HoverCard.Root
        openDelay={50}
        closeDelay={100}
        onOpenChange={(open) => {
          setOpen(open);
        }}
      >
        <HoverCard.Trigger
          onMouseMove={handleMouseMove}
          className={cn("text-foreground", className)}
          asChild
        >
          <a>{children}</a>
        </HoverCard.Trigger>

        {/* Render the content in a portal to escape container bounds */}
        {typeof document !== 'undefined' && createPortal(
          <HoverCard.Content
            className="[transform-origin:var(--radix-hover-card-content-transform-origin)] z-[9999]"
            side="top"
            align="center"
            sideOffset={10}
            collisionPadding={20}
            avoidCollisions={true}
            sticky="partial"
            // Force the content to stay within viewport bounds
            onEscapeKeyDown={() => setOpen(false)}
          >
            <AnimatePresence>
              {isOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 20, scale: 0.6 }}
                  animate={{
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    transition: {
                      type: "spring",
                      stiffness: 260,
                      damping: 20,
                    },
                  }}
                  exit={{ opacity: 0, y: 20, scale: 0.6 }}
                  className="shadow-xl rounded-xl max-w-xs"
                  style={{
                    x: translateX,
                  }}
                >
                  <a
                    onClick={() => openExternalUrl(url)}
                    className="block p-1 bg-card backdrop-blur-sm border-2 border-transparent shadow rounded-lg hover:border-border"
                    style={{ fontSize: 0 }}
                  >
                    <img
                      src={isStatic ? imageSrc : src}
                      width={width}
                      height={height}
                      loading="eager"
                      className="rounded-lg"
                      alt="preview image"
                      style={{
                        maxWidth: '100%',
                        height: 'auto'
                      }}
                    />
                  </a>
                </motion.div>
              )}
            </AnimatePresence>
          </HoverCard.Content>,
          document.body
        )}
      </HoverCard.Root>
    </>
  );
};