import React from 'react';
import { createRoot } from 'react-dom/client';
import './app.scss';
import { Home } from './pages/Home';
import { setConfig } from 'tls-notary-shared';

// Set config once before rendering
// setConfig(process.env.PROXY_API_URL);

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(<App />);

function App() {
  return <Home />;
}
