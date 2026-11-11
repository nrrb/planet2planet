import { lazy, Suspense } from 'react';
import { Route, Routes } from 'react-router-dom';
import { ComparePage } from '../pages/ComparePage';
import { NotFound } from '../pages/NotFound';
import { ErrorBoundary } from './ErrorBoundary';
import { Layout } from './Layout';

const AboutPage = lazy(() => import('../pages/AboutPage'));
const CanonPage = lazy(() => import('../pages/CanonPage'));
const SharePreviewPage = lazy(() => import('../pages/SharePreviewPage'));

export function App() {
  return (
    <Routes>
      {/* The share image is photographed full-bleed, so it sits outside the page layout. */}
      <Route
        path="share-preview"
        element={
          <Suspense fallback={null}>
            <SharePreviewPage />
          </Suspense>
        }
      />
      <Route element={<Layout />}>
        <Route
          index
          element={
            <ErrorBoundary>
              <ComparePage />
            </ErrorBoundary>
          }
        />
        <Route
          path="about"
          element={
            <ErrorBoundary>
              <Suspense fallback={<p role="status">Loading…</p>}>
                <AboutPage />
              </Suspense>
            </ErrorBoundary>
          }
        />
        <Route
          path="canon"
          element={
            <ErrorBoundary>
              <Suspense fallback={<p role="status">Loading…</p>}>
                <CanonPage />
              </Suspense>
            </ErrorBoundary>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  );
}
