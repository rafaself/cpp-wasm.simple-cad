# Cenários
1. Pan/Zoom: viewport 1920x1080, documento com ~1k entidades (snapshot fixo). Executar pan contínuo 10s e zoom in/out 5s.  
2. Seleção/Transform: selecionar grupo de 50 entidades e mover por 5s.  
3. Overlay/Idle: ficar inerte 15s após interações (mede polling/background).  
4. UI Interação: abrir/fechar Dialog (Settings) e Ribbon dropdown/Select 10x.

# Métricas
- Frame time (mean, p95) — alvo p95 ≤ 16ms; mean ≤ 10ms. Fallback para máquinas fracas: p95 ≤ 20ms e melhoria percentual vs. baseline (≥ -25% long tasks, ≥ -30% heap delta).
- Long tasks (>50ms) — alvo 0 nos cenários 1/2 (pan/zoom, seleção); cenário 4 permitir ≤1 (<80ms). Cenário 3 idealmente 0.
- CPU média — informativo (não pass/fail): anotar % em pan/zoom e idle para comparação.
- Heap delta — variação < +20% início→fim de cada cenário, sem trend ascendente.
- FPS — alvo ≥ 55 em pan/zoom/transform.

# Como coletar (Chrome DevTools)
1. Preparar doc: carregar snapshot padrão com ~1k entidades.  
2. Abrir Performance tab, desmarcar Screenshots; manter gravação padrão (JS profiler, CPU).  
3. Iniciar recording, executar o cenário manualmente.  
4. Parar recording; anotar p95 frame e mean, long tasks count/duração, CPU média (informativa), heap delta (Memory panel ou Timelines), FPS (overlay).  
5. Registrar em tabela: [Commit/Branch, Cenário, Mean, p95, LongTasks, CPU% (info), HeapΔ, FPS].

# Limites alvo (pass/fail)
- Primário: p95 frame ≤ 16ms (fallback ≤ 20ms com melhoria percentual conforme acima); mean ≤ 10ms.
- Long tasks: 0 nos cenários 1/2 (idealmente 0 no 3); cenário 4 ≤1 <80ms.
- Heap delta ≤ +20%, sem growth contínuo.
- FPS ≥ 55 em pan/zoom/transform.
- CPU somente informativo (comparar before/after, não barra).

# Before/After
- Executar benchmark antes da Fase 3 e após concluir Fase 3; repetir ao final da Fase 5.  
- Comparar tabelas; regressão = falha de fase até corrigir. 
