import { create } from 'zustand';
import { LibrarySymbol, loadElectricalLibrary } from '../features/library/electricalLoader';

interface LibraryState {
  electricalSymbols: Record<string, LibrarySymbol>;
  isLoading: boolean;
  lastWorldScale?: number;
  loadLibrary: (worldScale: number) => Promise<void>;
}

export const useLibraryStore = create<LibraryState>((set, get) => ({
  electricalSymbols: {},
  isLoading: false,
  lastWorldScale: undefined,
  loadLibrary: async (worldScale: number) => {
    const { lastWorldScale, electricalSymbols } = get();
    if (lastWorldScale === worldScale && Object.keys(electricalSymbols).length > 0) {
      return;
    }

    set({ isLoading: true });

    // Simulate a small delay if needed to ensure UI can show loading state,
    // but here we just process synchronously as it's CPU bound
    const symbols = loadElectricalLibrary(worldScale);

    const symbolMap = Object.fromEntries(symbols.map((symbol) => [symbol.id, symbol]));
    set({ electricalSymbols: symbolMap, isLoading: false, lastWorldScale: worldScale });
  }
}));
