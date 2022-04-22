import { TRPCError } from '../TRPCError';
import { BaseHandlerOptions } from '../internals/BaseHandlerOptions';
import { callProcedure } from '../internals/callProcedure';
import { getErrorFromUnknown } from '../internals/errors';
import { transformTRPCResponse } from '../internals/transformTRPCResponse';
import { AnyRouter, ProcedureType, inferRouterContext } from '../router';
import { TRPCErrorResponse, TRPCRequest, TRPCResponse } from '../rpc';
import { Subscription } from '../subscription';
import { CombinedDataTransformer } from '../transformer';

interface MessageEvent<T = any> extends Event {
  /**
   * Returns the data of the message.
   */
  readonly data: T;
  /**
   * Returns the last event ID string, for server-sent events.
   */
  readonly lastEventId: string;
  /**
   * Returns the origin of the message, for server-sent events and cross-document messaging.
   */
  readonly origin: string;
}

interface PostMessage {
  postMessage(message: any, targetOrigin: string): void;
  addEventListener(type: 'message', listener: (ev: MessageEvent) => void): void;
  removeEventListener(
    type: 'message',
    listener: (ev: MessageEvent) => void,
  ): void;
}

/* istanbul ignore next */
function assertIsObject(obj: unknown): asserts obj is Record<string, unknown> {
  if (typeof obj !== 'object' || Array.isArray(obj) || !obj) {
    throw new Error('Not an object');
  }
}
/* istanbul ignore next */
function assertIsProcedureType(obj: unknown): asserts obj is ProcedureType {
  if (obj !== 'query' && obj !== 'subscription' && obj !== 'mutation') {
    throw new Error('Invalid procedure type');
  }
}
/* istanbul ignore next */
function assertIsRequestId(
  obj: unknown,
): asserts obj is number | string | null {
  if (
    obj !== null &&
    typeof obj === 'number' &&
    isNaN(obj) &&
    typeof obj !== 'string'
  ) {
    throw new Error('Invalid request id');
  }
}
/* istanbul ignore next */
function assertIsString(obj: unknown): asserts obj is string {
  if (typeof obj !== 'string') {
    throw new Error('Invalid string');
  }
}
/* istanbul ignore next */
function assertIsJSONRPC2OrUndefined(
  obj: unknown,
): asserts obj is '2.0' | undefined {
  if (typeof obj !== 'undefined' && obj !== '2.0') {
    throw new Error('Must be JSONRPC 2.0');
  }
}
function parseMessage(
  obj: unknown,
  transformer: CombinedDataTransformer,
): TRPCRequest {
  assertIsObject(obj);
  const { method, params, id, jsonrpc } = obj;
  assertIsRequestId(id);
  assertIsJSONRPC2OrUndefined(jsonrpc);
  if (method === 'subscription.stop') {
    return {
      id,
      method,
      params: undefined,
    };
  }
  assertIsProcedureType(method);
  assertIsObject(params);

  const { input: rawInput, path } = params;
  assertIsString(path);
  const input = transformer.input.deserialize(rawInput);
  return { jsonrpc, id, method, params: { input, path } };
}

/**
 * PostMessage server handler
 */
export type PMSHandlerOptions<TRouter extends AnyRouter> = BaseHandlerOptions<
  TRouter,
  undefined
> & {
  targetOrigin: string;
  pms: PostMessage;
};

export async function applyPMSHandler<TRouter extends AnyRouter>(
  opts: PMSHandlerOptions<TRouter>,
) {
  const { targetOrigin, pms, router } = opts;

  const { transformer } = router._def;

  const clientSubscriptions = new Map<number | string, Subscription<TRouter>>();

  function respond(untransformedJSON: TRPCResponse) {
    pms.postMessage(
      JSON.stringify(transformTRPCResponse(router, untransformedJSON)),
      targetOrigin,
    );
  }
  const ctx: inferRouterContext<TRouter> | undefined = undefined;

  async function handleRequest(msg: TRPCRequest) {
    const { id } = msg;
    /* istanbul ignore next */
    if (id === null) {
      throw new TRPCError({
        code: 'BAD_REQUEST',
        message: '`id` is required',
      });
    }
    if (msg.method === 'subscription.stop') {
      const sub = clientSubscriptions.get(id);
      if (sub) {
        sub.destroy();
      }
      clientSubscriptions.delete(id);
      return;
    }
    const { path, input } = msg.params;
    const type = msg.method;
    try {
      const result = await callProcedure({
        path,
        input,
        type,
        router,
        ctx,
      });

      if (!(result instanceof Subscription)) {
        respond({
          id,
          result: {
            type: 'data',
            data: result,
          },
        });
        return;
      }

      const sub = result;
      /* istanbul ignore next */
      if (clientSubscriptions.has(id)) {
        // duplicate request ids for client
        sub.destroy();
        throw new TRPCError({
          message: `Duplicate id ${id}`,
          code: 'BAD_REQUEST',
        });
      }
      clientSubscriptions.set(id, sub);
      sub.on('data', (data: unknown) => {
        respond({
          id,
          result: {
            type: 'data',
            data,
          },
        });
      });
      sub.on('error', (_error: unknown) => {
        const error = getErrorFromUnknown(_error);
        const json: TRPCErrorResponse = {
          id,
          error: router.getErrorShape({
            error,
            type,
            path,
            input,
            ctx,
          }),
        };
        opts.onError?.({ error, path, type, ctx, req: undefined, input });
        respond(json);
      });
      sub.on('destroy', () => {
        respond({
          id,
          result: {
            type: 'stopped',
          },
        });
      });

      respond({
        id,
        result: {
          type: 'started',
        },
      });
      await sub.start();
    } catch (cause) /* istanbul ignore next */ {
      // procedure threw an error
      const error = getErrorFromUnknown(cause);
      const json = router.getErrorShape({
        error,
        type,
        path,
        input,
        ctx,
      });
      opts.onError?.({ error, path, type, ctx, req: undefined, input });
      respond({ id, error: json });
    }
  }
  pms.addEventListener('message', async (message) => {
    try {
      const msgJSON: unknown = JSON.parse(message.toString());
      const msgs: unknown[] = Array.isArray(msgJSON) ? msgJSON : [msgJSON];
      const promises = msgs
        .map((raw) => parseMessage(raw, transformer))
        .map(handleRequest);
      await Promise.all(promises);
    } catch (cause) {
      const error = new TRPCError({
        code: 'PARSE_ERROR',
        cause,
      });

      respond({
        id: null,
        error: router.getErrorShape({
          error,
          type: 'unknown',
          path: undefined,
          input: undefined,
          ctx: undefined,
        }),
      });
    }
  });

  const close = () => {
    for (const sub of clientSubscriptions.values()) {
      sub.destroy();
    }
    clientSubscriptions.clear();
  };
  return { close };
}
