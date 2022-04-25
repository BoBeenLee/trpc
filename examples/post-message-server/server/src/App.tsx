import * as trpc from '@trpc/browser';
import { applyPMSHandler } from '@trpc/browser/adapters/pm';
import React, { useEffect } from 'react';
import { z } from 'zod';
import './App.css';
import logo from './logo.svg';

type Context = {};

export const appRouter = trpc
  .router<Context>()
  .query('hello', {
    input: z
      .object({
        name: z.string(),
      })
      .nullish(),
    resolve: ({ input }) => {
      return {
        text: `hello ${input?.name ?? 'world'}`,
      };
    },
  })
  .mutation('createPost', {
    input: z.object({
      title: z.string(),
      text: z.string(),
    }),
    resolve({ input }) {
      // imagine db call here
      return {
        id: `${Math.random()}`,
        ...input,
      };
    },
  })
  .subscription('randomNumber', {
    resolve() {
      return new trpc.Subscription<{ randomNumber: number }>((emit) => {
        const timer = setInterval(() => {
          // emits a number every second
          emit.data({ randomNumber: Math.random() });
        }, 200);

        return () => {
          clearInterval(timer);
        };
      });
    },
  });

export type AppRouter = typeof appRouter;

function App() {
  useEffect(() => {
    applyPMSHandler<AppRouter>({
      targetOrigin: '*',
      pms: window,
      router: appRouter,
    });
  }, []);

  return (
    <div className="App">
      <header className="App-header">
        <img src={logo} className="App-logo" alt="logo" />
        <p>
          Edit <code>src/App.tsx</code> and save to reload.
        </p>
        <a
          className="App-link"
          href="https://reactjs.org"
          target="_blank"
          rel="noopener noreferrer"
        >
          Learn React
        </a>
      </header>
    </div>
  );
}

export default App;
