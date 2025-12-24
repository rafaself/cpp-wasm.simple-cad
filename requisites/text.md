# Ferramenta Texto

## Comportamento esperado

- O usuário pode criar texto de 2 formas:
  1. Clicar na ferramenta texto → Clicar na área de desenho → Digitar o texto. Nesse caso, a caixa de seleção do texto vai crescendo na horizontal ao decorrer que o usuário vai digitando, mas cresce na vertical caso ele de enter para quebrar linha. Comportamento idêntico ao do Figma!
  2. Clicar na ferramenta texto → Criar puxando com o mouse a área do texto → Digitar o texto. Nesse caso, a área do texto já foi definida. Então, o texto não ultrapassa horizontalmente a área do texto, mas ele pode ultrapassar (overflow) verticalmente, apesar da caixa ficar fixa. Similar ao FIGMA!
     Notar que a diferença básica é que na primeira a caixa é redimensionada ao decorrer que o usuário digita e na segunda o tamanho da caixa é fixa.
- Ao apertar ENTER há a quebra de linha.
- CTRL + ENTER, Clicar fora ou ESC confirma o texto.
- É possível fazer as personalizações de texto que já estão disponíveis no RIBBON que são negrito, itálico, sublinhado, riscado, centralizado, just. esquerda, just. direita, tamanho da fonte e fonte (pode ser bem poucas, apenas as 5 mais básicas disponíveis).
- É possível redimensionar a caixa de seleção do texto.
- Se o usuário redimensiona fazendo flip com a caixa de seleção DEPOIS DE CRIADO, o conteúdo (texto) também faz flip, assim como no Figma.
- É possível alterar estilização do texto apenas com a caixa de texto selecionada.
- Se o usuário selecionar apenas um trecho do texto, deve ser possível personalizar apenas esse trecho. Como por exemplo: apenas uma palavra selecionada ser em negrito.
- Importante: em relação a caixa de texto nunca ultrapassa a margem oposta na horizontal, faz quebra de linha, mas é possível fazer overflow na vertical.
- O texto inserido na área de desenho deve ser IDÊNTICO ao que está sendo digitado. É como se fosse um carimbo do que está sendo digitado na area de desenho.
- O texto será digitado na própria área de desenho.
- É possível mover o texto.
- Redimensionar a caixa de seleção não afeta nada na estilização do texto. Ou seja, aumentar a área de seleção, por exemplo, não deve aumentar o tamanho do texto.
- Por AGORA, todo texto estará sempre a frente de qualquer forma. Nota: A regra "texto sempre à frente" deve ser implementada de forma isolada, sem impedir futura ordenação de camadas (z-index / layers).
- Deve ser possível alterar a cor do texto.
- Deve ser possível alterar a cor de preenchimento do texto.
- Haverá um layer inicial “Texto” que será atribuído automaticamente para textos criados. A cor será branca e sem fundo.
