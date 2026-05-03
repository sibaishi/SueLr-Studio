import { createContext, useContext } from 'react';
import type { Colors } from '../lib/types';
import { DARK } from '../lib/constants';

export const TCtx = createContext<Colors>(DARK);
export const useT = () => useContext(TCtx);
