import React from 'react';

interface TerraformIconProps {
  size?: number;
  className?: string;
}

const Terraform: React.FC<TerraformIconProps> = ({ size = 14, className = "" }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="currentColor"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      <path d="M5.825 2.82l4.35 2.524v5.052L5.825 7.87V2.82zM10.651 5.344v5.052L15 7.87V2.82l-4.349 2.524zM1 0v5.05l4.349 2.527V2.526L1 0zM5.825 13.474L10.174 16v-5.051L5.825 8.423v5.051z"/>
    </svg>
  );
};

export default Terraform;