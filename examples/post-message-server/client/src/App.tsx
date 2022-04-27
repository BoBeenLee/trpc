import { createPMClient, pmLink } from '@trpc/client/links/pmLink';
import React from 'react';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from 'react-query';
import './App.css';
import Main from './components/Main';
import logo from './logo.svg';
import { trpc } from './trpc';

function App() {
  const [queryClient] = useState(() => new QueryClient());
  const [trpcClient] = useState(() =>
    trpc.createClient({
      url: '',
      links: [
        pmLink({
          client: createPMClient({
            targetOrigin: '*',
            PostMessage: window,
          }),
        }),
      ],
    }),
  );

  return (
    <React.Fragment>
      <trpc.Provider client={trpcClient} queryClient={queryClient}>
        <QueryClientProvider client={queryClient}>
          <Main />
        </QueryClientProvider>
      </trpc.Provider>
      <iframe src={'https://localhost:3000'} />
    </React.Fragment>
  );
}

export default App;
