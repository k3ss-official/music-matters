import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

// StrictMode disabled — it double-invokes effects which breaks WaveSurfer (imperative audio API)
ReactDOM.createRoot(document.getElementById('root')!).render(
  <App />
);
