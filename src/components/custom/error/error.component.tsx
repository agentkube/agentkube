import React from 'react';
import LOGO from '@/assets/logo.png';
import KUBERNETES_LOGO from '@/assets/kubernetes.svg';

const ErrorComponent = ({
  message = "Please check your port forwarding",
  title = "Oups! Something went wrong!",
  subMessage = "Will you please try one more time? Pretty please? 🥺",
  buttonText = "Try again",
  onRetry = () => window.location.reload()
}) => {
  return (
    <div className="flex items-center justify-center min-h-[80vh] p-4">
      <div className="w-full max-w-md bg-card backdrop-blur-sm rounded-xl overflow-hidden">
        <div className="p-8 flex flex-col items-center">
          {/* Pencil Break Icon */}
          {/* <div className="mb-6 relative w-24 h-24">
            <div className="absolute left-4 top-6 w-16 h-6 bg-yellow-400 rounded-sm transform -rotate-[20deg]">
              <div className="absolute -left-1 top-0 w-4 h-6 bg-red-500 rounded-l-sm"></div>
              <div className="absolute right-0 top-0 w-0 h-0 
                border-l-[6px] border-l-transparent
                border-t-[3px] border-t-black
                border-b-[3px] border-b-black"></div>
            </div>
            <div className="absolute right-4 top-6 w-16 h-6 bg-yellow-400 rounded-sm transform rotate-[20deg]">
              <div className="absolute -right-1 top-0 w-4 h-6 bg-red-500 rounded-r-sm"></div>
              <div className="absolute left-0 top-0 w-0 h-0 
                border-r-[6px] border-r-transparent
                border-t-[3px] border-t-black
                border-b-[3px] border-b-black"></div>
            </div>
            <div className="absolute top-0 left-1/2 transform -translate-x-1/2">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M2 18L5 15M13 7L16 4M5 4L2 1M16 15L13 12" stroke="black" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>

          </div> */}

          {/* Text Content */}
          <h2 className="text-2xl font-bold text-foreground  text-center">{title}</h2>
          {/* <div className="bg-gray-200 p-3 rounded-[0.5rem] font-mono text-sm mb-4 overflow-x-auto max-w-full">
            <code>kubectl port-forward -n agentkube-operator-system svc/agentkube-operator-controller 8082:8082</code>
          </div> */}
          <div className='flex items-center justify-center my-4'>
            <img src={KUBERNETES_LOGO} className='h-12 w-12' alt='kubernetes' />
          </div>
          <p className="text-foreground mb-2 text-center">{message}</p>
          <p className="text-muted-foreground mb-8 text-center text-sm">{subMessage}</p>

          {/* Button */}
          <button
            className="py-3 px-6 w-full bg-gray-900 hover:bg-gray-800 text-white font-medium rounded-[0.4rem] transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-gray-900"
            onClick={onRetry}
          >
            {buttonText}
          </button>
        </div>

        {/* Footer */}
        <div className="flex justify-center p-4 border-t border-border">
          <div className="flex items-center text-foreground">
            <img src={LOGO} className='h-8 w-8' alt='logo' />
            <span className="font-semibold">Agentkube</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ErrorComponent;