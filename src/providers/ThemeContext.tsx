import { createContext, useContext } from 'react';

/** Canvas drawing code uses the resolved mode to refresh computed CSS colors. */
export const ResolvedThemeContext = createContext<'dark' | 'light'>('dark');
export const useResolvedTheme = () => useContext(ResolvedThemeContext);
