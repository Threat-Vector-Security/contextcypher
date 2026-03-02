import React from 'react';

interface ProFeatureGuardProps {
  featureId: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showUpgradeButton?: boolean;
  upgradeButtonText?: string;
  inline?: boolean;
  tooltip?: string;
}

export const ProFeatureGuard: React.FC<ProFeatureGuardProps> = ({ children }) => {
  return <>{children}</>;
};

export default ProFeatureGuard;
