import { createContext, useContext } from 'react';
import type { Colors } from '@/shared/types';
import { DARK } from '@/app/theme/constants';

export const TCtx = createContext<Colors>(DARK);
export const useT = () => useContext(TCtx);
