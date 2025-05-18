import React from 'react';
import { useState } from 'react';
import type { ReactNode } from 'react';

interface TabLayoutProps {
  tabs: { name: string; content: ReactNode }[];
}

export function TabLayout({ tabs }: TabLayoutProps) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="w-full">
      <div className="flex border-b">
        {tabs.map((tab, index) => (
          <button
            key={index}
            className={`px-4 py-2 font-medium ${
              index === activeTab ? 'border-b-2 border-blue-600 text-blue-600' : 'text-gray-500'
            }`}
            onClick={() => setActiveTab(index)}
          >
            {tab.name}
          </button>
        ))}
      </div>
      <div className="p-4">
        {tabs[activeTab].content}
      </div>
    </div>
  );
}
