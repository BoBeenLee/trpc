import React from 'react';

const Main = (props: any) => {
  const { trpc } = props;
  const hello = trpc.useQuery(['hello', { text: 'client' } as any]);
  if (!hello.data) return <div>Loading...</div>;
  return (
    <div>
      <p>{hello.data.greeting}</p>
    </div>
  );
};

export default Main;
