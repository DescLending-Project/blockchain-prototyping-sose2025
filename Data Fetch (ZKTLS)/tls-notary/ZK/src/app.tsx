import React from 'react';
import { createRoot } from 'react-dom/client';
import './app.scss';
import { Home } from './pages/Home';

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(<App />);

function App() {
  return (
    <Home />
  );
}
