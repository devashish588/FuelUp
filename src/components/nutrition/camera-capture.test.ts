// Camera error mapping: every getUserMedia failure mode gets a user-safe
// message with an upload fallback. Pure function — fully testable here;
// the component wires it to UI states.
import { describe, expect, it } from 'vitest';
import { cameraErrorMessage } from './camera-capture';

describe('cameraErrorMessage', () => {
  it('maps missing/constrained hardware to the unsupported state', () => {
    expect(cameraErrorMessage('NotFoundError')).toMatchObject({ status: 'unsupported' });
    expect(cameraErrorMessage('OverconstrainedError')).toMatchObject({ status: 'unsupported' });
  });

  it('explains busy cameras and insecure contexts with upload fallback', () => {
    const busy = cameraErrorMessage('NotReadableError');
    expect(busy.status).toBe('denied');
    expect(busy.message).toMatch(/busy/i);
    const insecure = cameraErrorMessage('SecurityError');
    expect(insecure.status).toBe('denied');
    expect(insecure.message).toMatch(/HTTPS/i);
  });

  it('treats dismissals and unknown errors as denied without crashing', () => {
    expect(cameraErrorMessage('NotAllowedError')).toMatchObject({ status: 'denied' });
    expect(cameraErrorMessage(undefined)).toMatchObject({ status: 'denied' });
    expect(cameraErrorMessage('SomethingElse')).toMatchObject({ status: 'denied' });
  });
});
