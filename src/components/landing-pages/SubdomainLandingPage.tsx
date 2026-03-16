import React from 'react';
import { Navigate, useParams } from 'react-router-dom';

const LandingPagePublic = React.lazy(() => import('./LandingPagePublic'));

const LP_HOSTNAME = 'lp.orbepet.com.br';

const SubdomainLandingPage: React.FC = () => {
  const { slug } = useParams<{ slug: string }>();
  const isLpSubdomain = window.location.hostname === LP_HOSTNAME;

  if (!isLpSubdomain || !slug) {
    return <Navigate to="/" replace />;
  }

  return <LandingPagePublic />;
};

export default SubdomainLandingPage;
