import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { setTransport } from './api/client';

// Component tests stub fetch with canned replies; the app itself answers from the engine instead.
setTransport((path, init) => fetch(path, init));

afterEach(() => cleanup());
