import React, { ReactElement, useCallback, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import * as Comlink from 'comlink';
import { PresentationJSON } from 'tlsn-js/build/types';
import './app.scss';
import { Home } from './pages/Home';
// Import the worker for initialization
const { init }: any = Comlink.wrap(
    new Worker(new URL('./script/worker.ts', import.meta.url)),
);

const container = document.getElementById('root');
const root = createRoot(container!);

root.render(<App />);

function App() {
  return (
    <Home />
  );
}
