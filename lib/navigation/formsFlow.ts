const ROUTES = {
  site: '/app/forms/site',
  category: '/app/forms/category',
  subcategory: '/app/forms/subcategory',
  new: '/app/forms/new',
} as const;

type FlowFailure = {
  ok: false;
  reason: string;
  redirectTo: string;
};

type FlowSuccess<T> = { ok: true } & T;

function readParam(params: URLSearchParams, key: string) {
  const value = params.get(key)?.trim();
  return value ? value : null;
}

function redirectToCategory(siteId: string) {
  return `${ROUTES.category}?siteId=${encodeURIComponent(siteId)}`;
}

function redirectToSubcategory(siteId: string, categoryId: string) {
  return `${ROUTES.subcategory}?siteId=${encodeURIComponent(siteId)}&categoryId=${encodeURIComponent(categoryId)}`;
}

function redirectToNew(siteId: string, categoryId: string, subcategoryId: string) {
  return `${ROUTES.new}?siteId=${encodeURIComponent(siteId)}&categoryId=${encodeURIComponent(categoryId)}&subcategoryId=${encodeURIComponent(subcategoryId)}`;
}

export function parseSiteStepParams(params: URLSearchParams): FlowSuccess<{ siteId: string }> | FlowFailure {
  const siteId = readParam(params, 'siteId');
  if (!siteId) {
    return { ok: false, reason: 'Missing siteId', redirectTo: ROUTES.site };
  }

  return { ok: true, siteId };
}

export function parseCategoryStepParams(params: URLSearchParams): FlowSuccess<{ siteId: string }> | FlowFailure {
  const siteId = readParam(params, 'siteId');
  if (!siteId) {
    return { ok: false, reason: 'Missing siteId', redirectTo: ROUTES.site };
  }

  return { ok: true, siteId };
}

export function parseSubcategoryStepParams(
  params: URLSearchParams
): FlowSuccess<{ siteId: string; categoryId: string }> | FlowFailure {
  const siteId = readParam(params, 'siteId');
  if (!siteId) {
    return { ok: false, reason: 'Missing siteId', redirectTo: ROUTES.site };
  }

  const categoryId = readParam(params, 'categoryId');
  if (!categoryId) {
    return {
      ok: false,
      reason: 'Missing categoryId',
      redirectTo: redirectToCategory(siteId),
    };
  }

  return { ok: true, siteId, categoryId };
}

export function parseNewStepParams(
  params: URLSearchParams
): FlowSuccess<{ siteId: string; categoryId: string; subcategoryId: string; fieldDefinitionId: string | null }> | FlowFailure {
  const siteId = readParam(params, 'siteId');
  if (!siteId) {
    return { ok: false, reason: 'Missing siteId', redirectTo: ROUTES.site };
  }

  const categoryId = readParam(params, 'categoryId');
  if (!categoryId) {
    return {
      ok: false,
      reason: 'Missing categoryId',
      redirectTo: redirectToCategory(siteId),
    };
  }

  const subcategoryId = readParam(params, 'subcategoryId');
  if (!subcategoryId) {
    return {
      ok: false,
      reason: 'Missing subcategoryId',
      redirectTo: redirectToSubcategory(siteId, categoryId),
    };
  }

  const fieldDefinitionId = readParam(params, 'fieldDefinitionId');

  return {
    ok: true,
    siteId,
    categoryId,
    subcategoryId,
    fieldDefinitionId,
  };
}

export function buildFormsSelectionHref(route: keyof typeof ROUTES, params: Record<string, string>) {
  const query = new URLSearchParams(params);
  const qs = query.toString();
  return qs ? `${ROUTES[route]}?${qs}` : ROUTES[route];
}

export { ROUTES as FORMS_ROUTES };
