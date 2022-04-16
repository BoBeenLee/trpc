import { pipeFromArray } from './internals/pipe';
import { Observable, Observer, OperatorFunction, TeardownLogic } from './types';

export type inferObservableValue<
  TObservable extends Observable<unknown, unknown>,
> = TObservable extends Observable<infer TValue, unknown> ? TValue : never;

export function observable<TValue, TError = unknown>(
  subscribe: (observer: Observer<TValue, TError>) => TeardownLogic,
): Observable<TValue, TError> {
  const self: Observable<TValue, TError> = {
    subscribe(observer) {
      let teardownRef: TeardownLogic | null = null;
      let isDone = false;
      let unsubscribed = false;
      let teardownImmediately = false;
      function unsubscribe() {
        if (teardownRef === null) {
          teardownImmediately = true;
          return;
        }
        if (unsubscribed) {
          return;
        }
        unsubscribed = true;

        if (typeof teardownRef === 'function') {
          teardownRef();
        } else if (teardownRef) {
          teardownRef.unsubscribe();
        }
      }
      teardownRef = subscribe({
        next(value) {
          if (isDone) {
            return;
          }
          observer.next?.(value);
        },
        error(err) {
          if (isDone) {
            return;
          }
          isDone = true;
          observer.error?.(err);
          unsubscribe();
        },
        complete() {
          if (isDone) {
            return;
          }
          isDone = true;
          observer.complete?.();
          unsubscribe();
        },
      });
      if (teardownImmediately) {
        unsubscribe();
      }
      return {
        unsubscribe,
      };
    },
    pipe(
      ...operations: OperatorFunction<any, any, any, any>[]
    ): Observable<any, any> {
      return pipeFromArray(operations)(self) as any;
    },
  };
  return self;
}