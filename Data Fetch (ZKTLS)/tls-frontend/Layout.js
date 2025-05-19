import React from "react";

export default function Layout({ children }) {
  return (
    <div className="min-h-screen font-sans text-gray-900 bg-gray-50">
      <div className="relative">
        {/* Background pattern */}
        <div className="absolute inset-0 bg-grid-slate-100 [mask-image:linear-gradient(0deg,#fff,rgba(255,255,255,0.6))] -z-10"></div>
        
        {/* Add subtle circuit-board style pattern */}
        <style jsx global>{`
          .bg-grid-slate-100 {
            background-image: url("data:image/svg+xml,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32' width='32' height='32' fill='none' stroke='rgb(226 232 240 / 0.8)'%3e%3cpath d='M0 .5H31.5V32'/%3e%3c/svg%3e");
          }
          
          body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          }
        `}</style>
        
        {children}
        
        {/* Footer */}
        <footer className="mt-16 pb-8 text-center text-sm text-gray-500">
          <p>TLS Notary Tool &copy; {new Date().getFullYear()} - Cryptographic web content verification</p>
        </footer>
      </div>
    </div>
  );
}