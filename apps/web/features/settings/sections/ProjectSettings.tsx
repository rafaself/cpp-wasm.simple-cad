import React from 'react';

import { LABELS } from '@/i18n/labels';
import { useProjectStore } from '@/stores/useProjectStore';

import { Section } from '../../../components/ui/Section';

const ProjectSettings: React.FC = () => {
  const { projectTitle, setProjectTitle } = useProjectStore();

  return (
    <div className="flex flex-col">
      <Section title={LABELS.settings.general}>
        <div className="flex flex-col gap-2 py-2">
          <label htmlFor="project-title" className="text-sm text-text-muted">
            {LABELS.settings.projectTitle}
          </label>
          <input
            id="project-title"
            type="text"
            value={projectTitle}
            onChange={(e) => setProjectTitle(e.target.value)}
            className="bg-surface2 border border-border rounded px-3 py-2 text-sm text-text focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary w-full"
            placeholder="Nome do projeto"
          />
        </div>
      </Section>
    </div>
  );
};

export default ProjectSettings;
