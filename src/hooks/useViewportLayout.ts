import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@mui/material/styles';
import useMediaQuery from '@mui/material/useMediaQuery';
import {
  APP_SHELL_DIMENSIONS,
  PanelPresentation,
  ToolbarDensity,
  ViewportTier,
  getPanelPresentation,
  getResponsivePanelWidths,
  getToolbarDensity,
  getViewportTier
} from '../styles/layout';

interface ViewportSize {
  width: number;
  height: number;
}

const getViewportSize = (): ViewportSize => {
  if (typeof window === 'undefined') {
    return { width: 1440, height: 900 };
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight
  };
};

export interface ViewportLayoutState {
  viewport: ViewportSize;
  viewportTier: ViewportTier;
  isMobile: boolean;
  isTablet: boolean;
  isDesktop: boolean;
  isCompact: boolean;
  toolbarDensity: ToolbarDensity;
  toolboxPresentation: PanelPresentation;
  analysisPresentation: PanelPresentation;
  panelWidths: ReturnType<typeof getResponsivePanelWidths>;
  appShell: typeof APP_SHELL_DIMENSIONS;
}

export const useViewportLayout = (): ViewportLayoutState => {
  const theme = useTheme();
  const [viewport, setViewport] = useState<ViewportSize>(getViewportSize);

  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const isDesktop = useMediaQuery(theme.breakpoints.up('lg'));
  const isTablet = !isMobile && !isDesktop;

  useEffect(() => {
    if (typeof window === 'undefined') return;

    let rafId: number | null = null;
    const handleResize = () => {
      if (rafId !== null) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        setViewport(getViewportSize());
      });
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  }, []);

  const viewportTier = useMemo(() => getViewportTier(viewport.width), [viewport.width]);
  const panelWidths = useMemo(() => getResponsivePanelWidths(viewport.width), [viewport.width]);
  const toolbarDensity = useMemo(() => getToolbarDensity(viewportTier), [viewportTier]);
  const toolboxPresentation = useMemo(
    () => getPanelPresentation(viewportTier, 'toolbox'),
    [viewportTier]
  );
  const analysisPresentation = useMemo(
    () => getPanelPresentation(viewportTier, 'analysis'),
    [viewportTier]
  );

  return {
    viewport,
    viewportTier,
    isMobile,
    isTablet,
    isDesktop,
    isCompact: !isDesktop,
    toolbarDensity,
    toolboxPresentation,
    analysisPresentation,
    panelWidths,
    appShell: APP_SHELL_DIMENSIONS
  };
};

export default useViewportLayout;
