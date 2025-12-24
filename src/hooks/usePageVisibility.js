import { useState, useEffect } from 'react';

/**
 * Hook to detect browser tab visibility
 * Returns isVisible: true when tab is active, false when hidden
 */
const usePageVisibility = () => {
  const [isVisible, setIsVisible] = useState(!document.hidden);

  useEffect(() => {
    const handleVisibilityChange = () => {
      setIsVisible(!document.hidden);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, []);

  return isVisible;
};

export default usePageVisibility;

