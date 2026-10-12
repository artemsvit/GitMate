let session: Promise<string> | undefined;

function getSession() {
  session ??= window.fetch('/api/session', { credentials: 'same-origin' })
    .then(async response => {
      if (!response.ok) throw new Error('Could not authorize the Gitler session.');
      const data = await response.json();
      return data.token as string;
    }).catch(error => {
      session = undefined;
      throw error;
    });
  return session;
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${await getSession()}`);
  return window.fetch(input, { ...init, headers, credentials: 'same-origin' });
}
