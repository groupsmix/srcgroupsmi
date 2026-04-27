import { captureEdgeException } from '../_shared/sentry.js';

export async function onRequest(context) {
    const { env, request } = context;
    
    // Only accept POST or GET
    const url = new URL(request.url);
    const deployId = url.searchParams.get('deploy_id') || 'unknown';

    const err = new Error(`Synthetic deployment test exception (Deploy: ${deployId})`);
    
    // Fire to Sentry
    context.waitUntil(captureEdgeException(env, err, {
        tags: {
            is_health_check: 'true',
            deploy_id: deployId
        }
    }));
    
    // Return the deploy ID so the caller can poll for it
    return new Response(JSON.stringify({
        ok: true,
        message: 'Synthetic exception fired',
        deploy_id: deployId
    }), {
        headers: { 'Content-Type': 'application/json' }
    });
}
