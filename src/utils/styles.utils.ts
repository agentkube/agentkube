export const itemVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.5
    }
  }
};

export const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      delayChildren: 0.1,
      staggerChildren: 0.1
    }
  }
};


export const featureVariants = {
  hidden: { opacity: 0, scale: 0.95 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.3 }
  }
};

// Drawer animation variants
export const drawerVariants = {
  hidden: { 
    x: '100%',
    opacity: 0.3,
    transition: { 
      type: 'spring',
      stiffness: 300,
      damping: 30
    }
  },
  visible: { 
    x: 0,
    opacity: 1,
    transition: { 
      type: 'spring',
      stiffness: 300,
      damping: 30,
      duration: 0.2
    }
  },
  exit: { 
    x: '100%',
    opacity: 0,
    transition: { 
      type: 'spring',
      stiffness: 400,
      damping: 40,
      duration: 0.2
    }
  }
};

// Backdrop animation variants
export const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.2 } },
  exit: { opacity: 0, transition: { duration: 0.15 } }
};
