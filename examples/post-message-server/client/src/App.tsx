import { createPMClient, pmLink } from '@trpc/client/links/pmLink';
import { withTRPC } from '@trpc/next';
import React from 'react';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import './App.css';
import Main from './components/Main';
import logo from './logo.svg';
import { trpc } from './trpc';

function App(props: any) {
  return <Main {...props} />;
}

export default withTRPC<any>({
  config() {
    return {
      links: [
        pmLink({
          client: createPMClient({
            targetOrigin: '*',
            PostMessage: window,
          }),
        }),
      ],
    };
  },
})(App);
