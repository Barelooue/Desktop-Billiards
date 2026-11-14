# Desktop Billiards

[简体中文](README.md) · [English](README.en.md) · [日本語](README.ja.md) · [Français](README.fr.md) · [한국어](README.ko.md) · [Português](README.pt.md)

Um jogo de bilhar 3D para Windows. Pratique bola 9 numa mesa de caçapas estreitas, bola 8 chinesa (Heyball) ou snooker. Também é possível disputar torneios contra quatro níveis de adversários controlados pelo computador. A interface do jogo está em chinês simplificado.

**Janela flutuante.** No Windows, abra as configurações com `F1` para usar uma janela sempre visível e redimensionável com proporção fixa. A partida continua ao alternar para outro aplicativo.

**Modo espectador (高手如云).** Assista a dois jogadores de nível alto disputarem torneios de bola 9, Heyball ou snooker. Assuma o controle de qualquer lado e devolva-o ao computador quando quiser. O progresso é descartado ao sair da partida e o saldo do jogo permanece intacto.

## Executar no computador

1. Use Windows 10/11 x64 com .NET Framework 4.6.2 ou superior e o [Microsoft Edge WebView2 Evergreen Runtime](https://developer.microsoft.com/microsoft-edge/webview2/). Para compilar a partir do código-fonte, instale o [Node.js 24 LTS com npm](https://nodejs.org/en/download).
2. Clone o repositório ou extraia o arquivo baixado em **Code → Download ZIP** no GitHub. Abra o PowerShell na pasta do projeto. A primeira compilação baixa os pacotes npm e o SDK do WebView2.

   ```powershell
   npm.cmd ci
   npm.cmd run build
   ```

3. Abra `release/DesktopBilliards.exe`. Ao mover o jogo, mantenha as DLLs e a pasta `web/` ao lado do executável. O aplicativo de desktop funciona sem um servidor Node.

Para testar no navegador, execute `npm.cmd run build:web`. Com Python 3, execute `python -m http.server 8000 --bind 127.0.0.1 --directory release/web` e abra `http://127.0.0.1:8000` num navegador compatível com WebGL. A integração com o papel de parede e os controles nativos da janela pertencem à versão Windows.

## Controles

| Ação | Controle padrão |
| --- | --- |
| Andar ao redor da mesa | `A` / `D` ou arraste com o botão direito. Use a roda para ajustar a altura da visão |
| Posicionar a bola branca | Clique num ponto permitido na mesa ou no mapa e confirme com `V` ou o botão na tela |
| Assumir a postura ou levantar | `Espaço` para a postura de tacada, `O` para levantar |
| Mirar e jogar | Use o mouse ou `←` / `→`. Puxe o taco com o botão esquerdo ou segure `F`, depois solte |
| Efeitos e configurações | Selecione o ponto de contato no diagrama. `R` centraliza, `G` alterna a guia, `F1` abre as configurações e `Esc` volta |

No treino, o guia indica bola-alvo, ponto de contato, força, posição da branca e saídas pelas tabelas. Aplique o ponto de contato ou execute a tacada sugerida como demonstração.

## Regras e torneios

- **Bola 9**. Acerte primeiro a bola de menor número. Encaçape legalmente a 9 para vencer. As partidas incluem a regra dos três pontos na saída, push-out e derrota por três faltas consecutivas. A primeira saída é decidida numa disputa de aproximação à tabela. As seguintes alternam ou cabem ao vencedor, conforme o evento.
- **Heyball**. Limpe o seu grupo de bolas lisas ou listradas e depois encaçape legalmente a 8. Faltas na saída e reposições seguem a arbitragem do jogo. A primeira saída é decidida por aproximação à tabela, e as demais alternam.
- **Snooker**. Alterne bolas vermelhas e coloridas. Depois das vermelhas, jogue amarela, verde, marrom, azul, rosa e preta em ordem. O jogo inclui pontos de falta, concessão, reposição da preta em caso de empate e tacadas de 147 pontos. Sorteie quem começa e alterne a cada frame.
- **Torneios**. O nível mais baixo pode jogar o torneio do clube. Os três níveis superiores podem disputar grandes eventos quando elegíveis. Cada rack ou frame ganho conta no placar da partida. Os prêmios são pagos ao fim do torneio. O jogo usa chaves simplificadas e física aproximada.

[Regras da WPA](https://wpapool.com/rules/) · [Regras da WPBSA](https://www.wpbsa.com/rules/)

## Saldo inicial e progresso

**Novos jogadores começam com £250,00 de moeda do jogo**, sem empréstimos, títulos ou partidas registradas. O saldo, o progresso e os atalhos ficam no perfil local do aplicativo. Partidas inacabadas expiram 72 horas depois de serem salvas pela última vez.

## Desenvolvimento e créditos

Use `npm.cmd test` para executar os testes. Depois da compilação, `npm.cmd run test:ui` usa o Microsoft Edge instalado localmente. `src/` contém o jogo, `native/` o aplicativo Windows, `scripts/` as ferramentas de compilação e `tests/` os testes. A renderização usa Three.js e o aplicativo Windows usa Microsoft WebView2. Consulte os [créditos de áudio](assets/audio/CREDITS.txt) para ver autores e licenças. O código do projeto não declara uma licença de código aberto separada.
