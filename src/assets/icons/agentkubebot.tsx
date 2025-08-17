import React from 'react';

interface AgentkubeBotIconProps {
  size?: number;
  className?: string;
}

const AgentkubeBot: React.FC<AgentkubeBotIconProps> = ({ size = 24, className = "" }) => {
  return (
    <svg width={size} height={size} viewBox="0 0 282 340" fill="currentColor" xmlns="http://www.w3.org/2000/svg" className={className}>
      <rect x="13" y="48" width="242" height="170" rx="21" stroke="black" strokeWidth="26" />
      <mask id="path-2-inside-1_217_51" fill="white">
        <rect x="76" y="218" width="47" height="122" rx="14" />
      </mask>
      {/* left leg */}
      <rect x="76" y="218" width="47" height="122" rx="14" fill="black" stroke="black" strokeWidth="44" mask="url(#path-2-inside-1_217_51)" />
      <mask id="path-3-inside-2_217_51" fill="white">
        <rect x="161" y="218" width="47" height="122" rx="14" />
      </mask>
      {/* right leg */}
      <rect x="161" y="218" width="47" height="122" rx="14" fill="black" stroke="black" strokeWidth="44" mask="url(#path-3-inside-2_217_51)" />
      <mask id="path-4-inside-3_217_51" fill="white">
        <rect x="26" y="240" width="38" height="75" rx="10" />
      </mask>
      <rect x="26" y="240" width="38" height="75" rx="10" fill="black" stroke="black" strokeWidth="38" mask="url(#path-4-inside-3_217_51)" />
      <mask id="path-5-inside-4_217_51" fill="white">
        <rect x="220" y="240" width="62" height="38" rx="10" />
      </mask>
      <rect x="220" y="240" width="62" height="38" rx="10" fill="black" stroke="black" strokeWidth="38" mask="url(#path-5-inside-4_217_51)" />
      <mask id="path-6-inside-5_217_51" fill="white">
        <rect x="40" width="38" height="53" rx="10" />
      </mask>
      <rect x="40" width="38" height="53" rx="10" fill="black" stroke="black" strokeWidth="38" mask="url(#path-6-inside-5_217_51)" />
      <mask id="path-7-inside-6_217_51" fill="white">
        <rect x="59.4932" y="114.545" width="54.0016" height="54" rx="10" transform="rotate(0.518525 59.4932 114.545)" />
      </mask>
      {/* eye */}
      <rect x="59.4932" y="114.545" width="54.0016" height="54" rx="10" transform="rotate(0.518525 59.4932 114.545)" fill="black" stroke="black" strokeWidth="44" mask="url(#path-7-inside-6_217_51)" />
      <mask id="path-8-inside-7_217_51" fill="white">
        <rect x="160.5" y="115" width="54.0016" height="54" rx="10" transform="rotate(0.518525 160.5 115)" />
      </mask>
      {/* eye */}
      <rect x="160.5" y="115" width="54.0016" height="54" rx="10" transform="rotate(0.518525 160.5 115)" fill="black" stroke="black" strokeWidth="44" mask="url(#path-8-inside-7_217_51)" />
      <mask id="path-9-inside-8_217_51" fill="white">
        <rect x="114" y="218" width="61" height="73" rx="14" />
      </mask>
      {/* body */}
      <rect x="114" y="218" width="61" height="73" rx="14" fill="black" stroke="black" strokeWidth="44" mask="url(#path-9-inside-8_217_51)" />
    </svg>
  );
};

export default AgentkubeBot;