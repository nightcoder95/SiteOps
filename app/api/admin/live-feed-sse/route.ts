import { NextRequest } from 'next/server';

import { requireAdmin } from '@/lib/auth/guards';
import { getActivitySince } from '@/lib/db/queries/liveFeed';
import { ERROR_CODES } from '@/lib/errors/codes';
import { errorResponse } from '@/lib/errors/response';
import { logError } from '@/lib/logging/log';
import { generateRequestId } from '@/lib/utils/requestId';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const requestId = generateRequestId();

  try {
    const auth = await requireAdmin(request);
    if (!('session' in auth)) {
      return errorResponse(auth.error, 'Admin access required', auth.status, undefined, requestId);
    }

    const { searchParams } = new URL(request.url);
    const sinceParam = searchParams.get('since');
    const since = sinceParam ? new Date(sinceParam) : new Date(0);

    if (Number.isNaN(since.getTime())) {
      return errorResponse(ERROR_CODES.VALIDATION_ERROR, 'Invalid since parameter', 400, undefined, requestId);
    }

    const encoder = new TextEncoder();

    const stream = new ReadableStream({
      async start(controller) {
        const send = (data: unknown) => {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
        };

        send({ type: 'connected', requestId });

        let lastCheck = since;
        let active = true;

        const interval = setInterval(async () => {
          if (!active) return;
          try {
            const activity = await getActivitySince(lastCheck, 50);
            if (activity.length > 0) {
              send({ type: 'activity', items: activity });
              lastCheck = new Date(activity[0].createdAt);
            }
          } catch (e) {
            logError(requestId, e);
          }
        }, 2000);

        request.signal.addEventListener('abort', () => {
          active = false;
          clearInterval(interval);
          controller.close();
        });
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    logError(requestId, error);
    return errorResponse(ERROR_CODES.INTERNAL_ERROR, 'An unexpected error occurred', 500, undefined, requestId);
  }
}
