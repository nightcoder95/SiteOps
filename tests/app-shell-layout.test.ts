import { describe, expect, it } from 'vitest';

import * as appShellModule from '@/components/app-shell/AppShell';

describe('AppShell module', () => {
  it('provides a default export for app layout imports', () => {
    expect(appShellModule.default).toBeTypeOf('function');
  });
});
