import { describe, expect, it } from 'vitest';

import {
  parseCategoryStepParams,
  parseNewStepParams,
  parseSiteStepParams,
  parseSubcategoryStepParams,
} from '@/lib/navigation/formsFlow';

describe('formsFlow params', () => {
  it('requires siteId before category step', () => {
    expect(parseCategoryStepParams(new URLSearchParams())).toEqual({
      ok: false,
      reason: 'Missing siteId',
      redirectTo: '/app/forms/site',
    });
  });

  it('requires categoryId before subcategory step', () => {
    const result = parseSubcategoryStepParams(new URLSearchParams('siteId=site-1'));

    expect(result).toEqual({
      ok: false,
      reason: 'Missing categoryId',
      redirectTo: '/app/forms/category?siteId=site-1',
    });
  });

  it('requires subcategoryId before new step', () => {
    const result = parseNewStepParams(new URLSearchParams('siteId=site-1&categoryId=category-1'));

    expect(result).toEqual({
      ok: false,
      reason: 'Missing subcategoryId',
      redirectTo: '/app/forms/subcategory?siteId=site-1&categoryId=category-1',
    });
  });

  it('accepts a valid site step query', () => {
    expect(parseSiteStepParams(new URLSearchParams('siteId=site-1'))).toEqual({
      ok: true,
      siteId: 'site-1',
    });
  });
});
