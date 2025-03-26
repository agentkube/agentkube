import React, { FC } from 'react';

export const generateColorFromEmail = (email: string) => {
  let hash = 0;
  for (let i = 0; i < email.length; i++) {
    hash = email.charCodeAt(i) + ((hash << 5) - hash);
  }
  return `hsl(${hash % 360}, 70%, 75%)`;
};

export const getInitials = (name: string) => {
  return name.split(' ').map(word => word[0]).join('').toUpperCase();
};

export const UserAvatar: FC<{ name: string; email: string; className?: string }> = ({
  name,
  email,
  className = "w-8 h-8"
}) => (
  <div
    className={`${className} border border-gray-800 rounded-full flex items-center justify-center text-gray-800 font-medium text-sm`}
    style={{ backgroundColor: generateColorFromEmail(email) }}
  >
    {getInitials(name)}
  </div>
);