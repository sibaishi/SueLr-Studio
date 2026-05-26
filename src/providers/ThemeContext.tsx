import { DARK } from '@/app/theme/constants';
import type { Colors } from '@/shared/types';
import { createContext, useContext } from 'react';

export const TCtx = createContext<Colors>(DARK);
export const useT = () => useContext(TCtx);
