"use client";
 
import { motion } from "motion/react";

// One moment...
// Thinking...
// Working on it...
// Generating response...
// Let me take a look...
// Almost there...
// Crafting the response...
export function ShiningText() {
  return (
    <motion.h1
      className="bg-[linear-gradient(110deg,#404040,35%,#fff,50%,#404040,75%,#404040)] bg-[length:200%_100%] bg-clip-text text-xs font-medium text-transparent"
      initial={{ backgroundPosition: "200% 0" }}
      animate={{ backgroundPosition: "-200% 0" }}
      transition={{
        repeat: Infinity,
        duration: 2,
        ease: "linear",
      }}
    >
     Crafting the response...
    </motion.h1>
  );
}