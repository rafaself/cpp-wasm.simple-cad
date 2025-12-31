import { create } from 'zustand';

interface ProjectState {
  projectTitle: string;
  setProjectTitle: (title: string) => void;
}

export const useProjectStore = create<ProjectState>((set) => ({
  projectTitle: 'Projeto Sem Título',
  setProjectTitle: (title) => set({ projectTitle: title }),
}));
