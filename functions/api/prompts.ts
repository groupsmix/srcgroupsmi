import { jsonResponse } from './_shared/response';
import { requireAuth } from './_shared/auth';
import type { PagesContext } from './_shared/types';
import { TOOL_PROMPTS } from './_shared/ai-prompts';

export async function onRequest(context: PagesContext) {
    const { request, env } = context;
    const origin = request.headers.get('Origin') || null;

    if (request.method !== 'GET') {
        return jsonResponse({ error: 'Method not allowed' }, 405, origin);
    }

    const authResult = await requireAuth(request, env);
    if (authResult instanceof Response) return authResult;

    // Only admins should be able to read all prompts
    if (authResult.user.role !== 'admin' && authResult.user.role !== 'moderator') {
        return jsonResponse({ error: 'Forbidden' }, 403, origin);
    }

    return jsonResponse({ prompts: Object.keys(TOOL_PROMPTS) }, 200, origin);
}