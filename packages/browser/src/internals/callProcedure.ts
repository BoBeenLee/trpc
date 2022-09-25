import type { AnyRouter, ProcedureType } from '@trpc/server';
import type { Subscription } from '@trpc/server';

export async function callProcedure<
  TRouter extends AnyRouter<TContext>,
  TContext,
>(opts: {
  path: string;
  input: unknown;
  router: TRouter;
  ctx: TContext;
  type: ProcedureType;
}): Promise<unknown | Subscription<TRouter>> {
  const { type, path, input } = opts;

  const caller = opts.router.createCaller(opts.ctx);
  if (type === 'query') {
    return caller.query(path, input as any);
  }
  if (type === 'mutation') {
    return caller.mutation(path, input as any);
  }
  if (type === 'subscription') {
    const sub = (await caller.subscription(path, input as any)) as Subscription;
    return sub;
  }
  /* istanbul ignore next */
  throw new Error(`Unknown procedure type ${type}`);
}
