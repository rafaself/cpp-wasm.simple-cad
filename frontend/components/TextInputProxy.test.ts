import { describe, it, expect } from 'vitest';

import { computeInputDelta } from './TextInputProxy';

describe('computeInputDelta', () => {
  it('inserts inside repeated letters without drifting to the run end', () => {
    const delta = computeInputDelta('mundddo', 'munddddo', 4, { start: 3, end: 3 });

    expect(delta).toEqual({ type: 'insert', at: 3, text: 'd' });
  });

  it('inserts between identical adjacent characters at the caret', () => {
    const delta = computeInputDelta('mundo', 'munndo', 3, { start: 2, end: 2 });

    expect(delta).toEqual({ type: 'insert', at: 2, text: 'n' });
  });

  it('inserts repeated prefix at the start without duplication', () => {
    const delta = computeInputDelta(
      'teste hola mundo',
      'testeteste hola mundo',
      5,
      { start: 0, end: 0 },
    );

    expect(delta).toEqual({ type: 'insert', at: 0, text: 'teste' });
  });
});
