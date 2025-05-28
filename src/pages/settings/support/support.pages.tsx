import React from 'react';
import { Github, Mail, Heart, ExternalLink, MessageSquare, Book, FileText, HelpCircle } from 'lucide-react';
import { openExternalUrl } from '@/api/external';
const Support = () => {
  return (
    <div 
    className="p-6">
      <h1 className="text-xl font-medium mb-6">Help & Support</h1>
      
      {/* Support Options */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
        {/* Documentation */}
        <div className="rounded-lg p-4 border dark:border-gray-800/60">
          <div className="flex items-center mb-3">
            <Book size={18} className="text-blue-400 mr-2" />
            <h2 className="text-lg font-medium">Documentation</h2>
          </div>
          <p className="text-gray-700 dark:text-gray-400 text-sm mb-3">
            Our documentation covers most questions and helps you get the most out of Agentkube.
          </p>
          <a 
            onClick={() => openExternalUrl("https://docs.agentkube.com")} 
            rel="noopener noreferrer"
            className="flex items-center text-blue-400 hover:text-blue-300 text-sm"
          >
            Browse Documentation <ExternalLink size={14} className="ml-1" />
          </a>
        </div>
        
        {/* FAQ */}
        <div className="rounded-lg p-4 border dark:border-gray-800/60">
          <div className="flex items-center mb-3">
            <HelpCircle size={18} className="text-purple-400 mr-2" />
            <h2 className="text-lg font-medium">Frequently Asked Questions</h2>
          </div>
          <p className="text-gray-700 dark:text-gray-400 text-sm mb-3">
            Find quick answers to common questions about using Agentkube.
          </p>
          <a 
            onClick={() => openExternalUrl("https://agentkube.com/help")} 
            rel="noopener noreferrer"
            className="flex items-center text-purple-400 hover:text-purple-300 text-sm"
          >
            View FAQ <ExternalLink size={14} className="ml-1" />
          </a>
        </div>
        
        {/* GitHub Issues */}
        <div className="rounded-lg p-4 border dark:border-gray-800/60">
          <div className="flex items-center mb-3">
            <Github size={18} className="text-gray-700 dark:text-gray-400 mr-2" />
            <h2 className="text-lg font-medium">GitHub Issues</h2>
          </div>
          <p className="text-gray-700 dark:text-gray-400 text-sm mb-3">
            Report bugs, request features, or contribute to the project on GitHub.
          </p>
          <a 
            onClick={() => openExternalUrl("https://github.com/agentkube/agentkube/issues")}
            rel="noopener noreferrer"
            className="flex items-center text-gray-700 dark:text-gray-400 hover:text-gray-300 text-sm cursor-pointer"
          >
            Open GitHub Issues <ExternalLink size={14} className="ml-1" />
          </a>
        </div>
        
        {/* Email Support */}
        <div className="rounded-lg p-4 border dark:border-gray-800/60">
          <div className="flex items-center mb-3">
            <Mail size={18} className="text-green-400 mr-2" />
            <h2 className="text-lg font-medium">Email Support</h2>
          </div>
          <p className="text-gray-700 dark:text-gray-400 text-sm mb-3">
            Need direct assistance? Reach out to our support team via email.
          </p>
          <a
            onClick={() => openExternalUrl("mailto:support@agentkube.com")}
            className="flex items-center text-green-400 hover:text-green-300 text-sm cursor-pointer"
          >
            support@agentkube.com <ExternalLink size={14} className="ml-1" />
          </a>
        </div>
      </div>
      
      {/* Community Section */}
      <div className="mb-8">
        <h2 className="text-lg font-medium mb-4">Join Our Community</h2>
        <div className="rounded-lg p-4 border dark:border-gray-800/60">
          <div className="flex items-center mb-3">
            <MessageSquare size={18} className="text-indigo-400 mr-2" />
            <h3 className="text-base font-medium">Discord Server</h3>
          </div>
          <p className="text-gray-700 dark:text-gray-400 text-sm mb-3">
            Connect with other Agentkube users, share tips, and get community help.
          </p>
          <a 
            onClick={() => openExternalUrl("https://discord.gg/Agentkube")}
            rel="noopener noreferrer"
            className="inline-block bg-indigo-600 hover:bg-indigo-700 text-white rounded px-4 py-2 text-sm cursor-pointer"
          >
            Join Discord
          </a>
        </div>
      </div>
      

      
      {/* Feedback Section */}
      <div className="rounded-lg p-4 border dark:border-gray-800/60">
        <div className="flex items-center mb-3">
          <Heart size={18} className="text-red-400 mr-2" />
          <h2 className="text-lg font-medium">We Value Your Feedback</h2>
        </div>
        <p className="text-gray-700 dark:text-gray-400 text-sm mb-4">
          Your feedback helps us improve Agentkube. Let us know what you think!
        </p>
        <button className="bg-gray-800/60 hover:bg-gray-600 text-white rounded px-4 py-2 text-sm"
          onClick={() => openExternalUrl("https://tally.so/r/nrY4JM")}
        >
          Send Feedback
        </button>
      </div>
    </div>
  );
};

export default Support;