---
description: Fluxo de trabalho de alta performance para o EndeavourCanvas (Frontend + Backend).
---

# Fluxo de Trabalho "Antigravity" 🛸

Este workflow foi desenhado para garantir velocidade e precisão no desenvolvimento do **EndeavourCanvas**, seguindo as diretrizes de `AGENTS.md` e `frontend/project-guidelines.md`.

## 1. Pulso do Ambiente (Health Check)

Sempre verifique se as dependências e serviços estão prontos.

// turbo

1. Instale dependências se necessário:
   - Frontend: `cd frontend && npm install`
   - Backend: `cd backend && pip install -r requirements.txt`

// turbo 2. Verifique se os testes básicos passam:

- Frontend: `cd frontend && npm run test`
- Backend: `cd backend && pytest`

## 2. Ciclo de Desenvolvimento "Zero-G"

Para novos recursos ou correções de bugs, siga esta ordem de operações:

### A. Análise de Impacto

- Verifique se a mudança afeta o **Modelo de Dados** (`frontend/src/types/index.ts`).
- Se for UI, verifique se deve ser um componente global (`frontend/src/components`) ou específico de feature (`frontend/src/features/...`).
- Verifique se a mudança afeta a **Geometria** (`frontend/src/utils/geometry.ts`).

### B. Implementação (Atomic & Clean)

- **State First**: Atualize o/os stores primeiro (`frontend/src/stores/`).
- **Logic Second**: Implemente a lógica de negócio ou renderização.
- **UI Last**: Crie ou atualize os componentes visuais.
- **Menu/Config**: Se adicionar ferramentas, atualize `frontend/src/config/menu.ts`.

### C. CAD/Canvas Checklist

- [ ] A ferramenta é determinística?
- [ ] Suporta Undo/Redo? (Ações via Store geralmente suportam).
- [ ] Elementos novos são serializáveis para JSON?
- [ ] O renderizador (`ShapeRenderer.ts`) foi atualizado adequadamente?

## 3. Verificação de Qualidade

Antes de concluir qualquer tarefa:

1. **Lint & Types**: Garanta que não há erros de TypeScript.
2. **Visual Check**: Se houver mudanças na UI, gere uma imagem ou verifique visualmente no browser.
3. **Tests**: Adicione ou atualize testes em `frontend/tests/` para comportamentos críticos.

## 4. Finalização e Relatório (Conforme AGENTS.md)

Ao concluir, se solicitado ou se a tarefa for complexa, gere o relatório:

1. Salve em `/resources/reports/report_<N>_<short-task-name>.md`.
2. O formato deve incluir:
   - **Problema**: Descrição breve do que foi resolvido.
   - **Solução**: Explicação técnica da abordagem.
   - **Arquivos Alterados**: Lista de arquivos.
   - **Risco**: Avaliação de risco.
   - **Verificação**: Como o usuário pode testar.

## 5. Comandos Úteis

| Ação                  | Comando                                       |
| :-------------------- | :-------------------------------------------- |
| Iniciar Frontend      | `cd frontend && npm run dev`                  |
| Iniciar Backend       | `cd backend && uvicorn app.main:app --reload` |
| Rodar Testes Frontend | `cd frontend && npm run test`                 |
| Rodar Testes Backend  | `cd backend && pytest`                        |
| Build de Produção     | `cd frontend && npm run build`                |

---

_Este workflow é a representação da excelência técnica do Antigravity no projeto EndeavourCanvas._
