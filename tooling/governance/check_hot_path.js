const fs = require('fs');
const path = require('path');

const HOT_PATH_FILES = [
  'apps/web/features/editor/components/EngineInteractionLayer.tsx',
  'apps/web/features/editor/interactions/handlers/DraftingHandler.tsx',
  'apps/web/features/editor/interactions/handlers/SelectionHandler.tsx',
  'apps/web/features/editor/interactions/handlers/TextHandler.tsx',
];

const VIOLATION_PATTERNS = [
  // Detecting direct setMousePos calls inside handler without throttle logic context
  // This is a naive check but effective for explicit function calls
  /setMousePos\(/,
  /setState\(/,
  /useUIStore.setState/,
];

const ROOT_DIR = path.resolve(__dirname, '../../');

let hasError = false;

console.log('Checking Hot Path violations...');

HOT_PATH_FILES.forEach(relPath => {
  const file = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(file)) return;

  const content = fs.readFileSync(file, 'utf8');
  const lines = content.split('\n');
  
  let inPointerMove = false;
  let bracketDepth = 0;

  lines.forEach((line, index) => {
    // Detect start of handlePointerMove or onPointerMove
    if (/const handlePointerMove/.test(line) || /onPointerMove/.test(line)) {
      inPointerMove = true;
      bracketDepth = 0; // Reset depth approximation
    }

    if (inPointerMove) {
      // Simple bracket counting to detect end of function (very approximate)
      const open = (line.match(/\{/g) || []).length;
      const close = (line.match(/\}/g) || []).length;
      bracketDepth += open - close;

      // Check violations
      VIOLATION_PATTERNS.forEach(pattern => {
        if (pattern.test(line)) {
          // Allow if it looks like it's inside a throttle/RAF block
          if (!line.includes('mousePosRef.current') && !line.includes('rafRef.current') && !line.includes('requestAnimationFrame')) {
             // Exceptions: "setIsMouseOverCanvas" is allowed per plan if needed, but ideally avoided.
             // We specifically target setMousePos
             if (line.includes('setMousePos(')) {
                // Check if it is inside a flush function or throttle check?
                // This static analysis is hard.
                // Instead, we just warn if we see setMousePos direct usage.
                // In our fixed implementation, setMousePos is called in 'flushMousePos', which is NOT 'handlePointerMove'.
                // So if 'setMousePos' appears inside 'handlePointerMove', it is likely a violation.
                console.error(`ERROR: Potential Hot Path violation in ${relPath}:${index + 1}`);
                console.error(`       ${line.trim()}`);
                console.error(`       Avoid direct state updates in pointermove. Use Ref + RAF.`);
                hasError = true;
             }
          }
        }
      });

      if (bracketDepth <= 0 && index > 0) { // Naive end detection
         // inPointerMove = false; // logic too brittle for single pass without AST
      }
    }
  });
});

if (hasError) {
  console.error('\nFAILURE: Hot Path violations detected.');
  process.exit(1);
} else {
  console.log('SUCCESS: No obvious Hot Path violations found.');
}
